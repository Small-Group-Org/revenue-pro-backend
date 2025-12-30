import { leadRepository } from "../repository/LeadRepository.js";
import { leadAggregationRepository } from "../repository/LeadAggregationRepository.js";
import { ActualRepository } from "../../actual/repository/repository.js";
import { DISENGAGEMENT } from '../utils/config.js';
import mongoose from "mongoose";
import User from "../../user/repository/models/user.model.js";
import { facebookConversionApiService } from "../../facebook/conversionApiService.js";
export class LeadService {
    constructor(leadRepo = leadRepository, aggregationRepo = leadAggregationRepository, actualRepo = new ActualRepository()) {
        this.leadRepo = leadRepo;
        this.aggregationRepo = aggregationRepo;
        this.actualRepo = actualRepo;
    }
    // ============= BASIC CRUD OPERATIONS =============
    /**
     * Helper method to update statusHistory (Option C: unique statuses with latest timestamp)
     * Updates existing entry if status already exists, otherwise adds new entry
     */
    updateStatusHistory(existing, newStatus) {
        if (!existing.statusHistory) {
            existing.statusHistory = [];
        }
        const now = new Date();
        const existingEntryIndex = existing.statusHistory.findIndex(entry => entry.status === newStatus);
        if (existingEntryIndex >= 0) {
            // Update existing entry with latest timestamp
            existing.statusHistory[existingEntryIndex].timestamp = now;
        }
        else {
            // Add new status entry
            existing.statusHistory.push({
                status: newStatus,
                timestamp: now
            });
        }
    }
    /**
     * Helper method to check if status allows proposalAmount
     */
    allowsProposalAmount(status) {
        return ['estimate_set', 'virtual_quote', 'proposal_presented', 'job_lost'].includes(status);
    }
    /**
     * Helper method to check if status allows jobBookedAmount
     */
    allowsJobBookedAmount(status) {
        return status === 'job_booked';
    }
    /**
     * Helper method to check if status should trigger Facebook Conversion API
     */
    shouldSendConversionEvent(status) {
        return status === 'job_booked';
    }
    /**
     * Send Facebook Conversion API event for lead status change
     */
    async sendFacebookConversionEvent(lead, newStatus) {
        try {
            // Only send if status is job_booked
            if (!this.shouldSendConversionEvent(newStatus)) {
                return;
            }
            // Get user's pixel credentials
            const user = await User.findById(lead.clientId);
            if (!user) {
                console.log(`User not found for clientId: ${lead.clientId}, skipping Conversion API`);
                return;
            }
            if (!user.fbPixelId || !user.fbPixelToken) {
                console.log(`Facebook Pixel credentials not configured for clientId: ${lead.clientId}, skipping Conversion API`);
                return;
            }
            // Send the conversion event
            await facebookConversionApiService.sendLeadEvent({
                pixelId: user.fbPixelId,
                pixelToken: user.fbPixelToken,
                email: lead.email,
                phone: lead.phone,
                leadId: String(lead._id),
            });
            console.log(`Facebook Conversion API event sent successfully for lead ${String(lead._id)}, status: ${newStatus}`);
        }
        catch (error) {
            // Log error but don't throw - we don't want to fail the lead update if FB API fails
            console.error(`Error sending Facebook Conversion API event for lead ${lead._id}:`, error.message);
            // Rethrow the error to show it to the user during testing phase
            throw error;
        }
    }
    /**
     * Update a lead by ID
     */
    async updateLead(id, data) {
        const existing = await this.leadRepo.getLeadById(id);
        if (!existing)
            throw new Error("Lead not found");
        const oldStatus = existing.status;
        let statusChanged = false;
        // Handle status change
        if (data.status && data.status !== existing.status) {
            statusChanged = true;
            // Update statusHistory before changing status
            this.updateStatusHistory(existing, data.status);
            existing.status = data.status;
            // Clear unqualifiedLeadReason if status is not "unqualified"
            if (data.status !== 'unqualified') {
                existing.unqualifiedLeadReason = '';
            }
            // Reset amounts if new status doesn't allow them
            if (!this.allowsProposalAmount(data.status)) {
                existing.proposalAmount = 0;
            }
            if (!this.allowsJobBookedAmount(data.status)) {
                existing.jobBookedAmount = 0;
            }
        }
        if (data.unqualifiedLeadReason) {
            existing.unqualifiedLeadReason = data.unqualifiedLeadReason;
        }
        // Handle notes field - can be updated regardless of status
        if (data.notes !== undefined) {
            existing.notes = data.notes.trim();
        }
        // Handle proposalAmount - allowed for: estimate_set, virtual_quote, proposal_presented, job_lost
        if (data.proposalAmount !== undefined) {
            if (this.allowsProposalAmount(existing.status)) {
                const parsedProposal = Number(data.proposalAmount);
                existing.proposalAmount = isFinite(parsedProposal) && parsedProposal >= 0 ? parsedProposal : 0;
            }
            else {
                throw new Error(`proposalAmount can only be set when status is one of: estimate_set, virtual_quote, proposal_presented, job_lost. Current status: ${existing.status}`);
            }
        }
        // Handle jobBookedAmount - allowed only for: job_booked
        if (data.jobBookedAmount !== undefined) {
            if (this.allowsJobBookedAmount(existing.status)) {
                const parsedBooked = Number(data.jobBookedAmount);
                existing.jobBookedAmount = isFinite(parsedBooked) && parsedBooked >= 0 ? parsedBooked : 0;
            }
            else {
                throw new Error(`jobBookedAmount can only be set when status is 'job_booked'. Current status: ${existing.status}`);
            }
        }
        // Set lastManualUpdate timestamp for manual operations
        existing.lastManualUpdate = new Date();
        await existing.save();
        // Send Facebook Conversion API event if status changed to job_booked
        if (statusChanged && data.status) {
            await this.sendFacebookConversionEvent(existing, data.status);
        }
        return existing;
    }
    /**
     * Soft delete multiple leads
     */
    async deleteLeads(ids) {
        const result = await this.leadRepo.bulkDeleteLeads(ids);
        return { deletedCount: result.modifiedCount || 0 };
    }
    /**
     * Upsert a lead (update if exists, create if not)
     */
    async upsertLead(query, payload) {
        const existingLead = (await this.leadRepo.findLeads(query))[0] || null;
        if (existingLead) {
            const updatePayload = { ...payload };
            updatePayload.leadScore = existingLead.leadScore;
            updatePayload.conversionRates = existingLead.conversionRates;
            // Handle proposalAmount and jobBookedAmount based on status
            if (updatePayload.status && !this.allowsProposalAmount(updatePayload.status)) {
                updatePayload.proposalAmount = 0;
            }
            if (updatePayload.status && !this.allowsJobBookedAmount(updatePayload.status)) {
                updatePayload.jobBookedAmount = 0;
            }
            // Update statusHistory if status is changing
            if (updatePayload.status && updatePayload.status !== existingLead.status) {
                // Need to get the document to update statusHistory
                const existingDoc = await this.leadRepo.getLeadById(existingLead._id);
                if (existingDoc) {
                    this.updateStatusHistory(existingDoc, updatePayload.status);
                    updatePayload.statusHistory = existingDoc.statusHistory;
                }
            }
            const result = await this.leadRepo.updateLead(query, updatePayload);
            if (!result)
                throw new Error("Failed to update lead");
            return this.normalizeLeadAmounts(result);
        }
        else {
            if (!payload.clientId || (!payload.phone && !payload.email)) {
                throw new Error('Missing required fields: clientId and at least phone or email');
            }
            const newLeadPayload = { ...payload };
            // Note: Lead scoring will be handled by LeadScoringService
            newLeadPayload.leadScore = 0;
            newLeadPayload.conversionRates = {};
            // Initialize proposalAmount and jobBookedAmount based on status
            const initialStatus = newLeadPayload.status || 'new';
            newLeadPayload.proposalAmount = this.allowsProposalAmount(initialStatus) ? (newLeadPayload.proposalAmount ?? 0) : 0;
            newLeadPayload.jobBookedAmount = this.allowsJobBookedAmount(initialStatus) ? (newLeadPayload.jobBookedAmount ?? 0) : 0;
            // Initialize statusHistory with initial status
            newLeadPayload.statusHistory = [{
                    status: initialStatus,
                    timestamp: new Date()
                }];
            return await this.leadRepo.upsertLead(query, newLeadPayload);
        }
    }
    // ============= BULK OPERATIONS =============
    /**
     * Bulk create leads with optional duplicate prevention
     */
    async bulkCreateLeads(payloads, uniquenessByPhoneEmail = false) {
        if (payloads.length === 0)
            return {
                documents: [],
                stats: { total: 0, newInserts: 0, duplicatesUpdated: 0 }
            };
        // Build operations based on uniqueness flag
        const bulkOps = payloads.map(lead => {
            const filter = { clientId: lead.clientId };
            // Apply email/phone uniqueness logic if enabled
            if (uniquenessByPhoneEmail) {
                const hasEmail = lead.email && lead.email.trim() !== '';
                const hasPhone = lead.phone && lead.phone.trim() !== '';
                if (hasEmail && hasPhone) {
                    // Both exist: match by either email OR phone
                    filter.$or = [
                        { email: lead.email },
                        { phone: lead.phone }
                    ];
                }
                else if (hasEmail) {
                    filter.email = lead.email;
                }
                else if (hasPhone) {
                    filter.phone = lead.phone;
                }
                else {
                    // Neither email nor phone exist: force new document
                    filter._id = new Date().getTime() + Math.random();
                }
            }
            else {
                // No uniqueness - always create new documents by using unique temporary ID
                filter._id = new Date().getTime() + Math.random() + Math.random();
            }
            return {
                updateOne: {
                    filter,
                    update: { $set: lead },
                    upsert: true
                }
            };
        });
        const result = await this.leadRepo.bulkWriteLeads(bulkOps, { ordered: false });
        const newInserts = result.upsertedCount || 0;
        const duplicatesUpdated = result.modifiedCount || 0;
        const total = newInserts + duplicatesUpdated;
        return {
            documents: [], // Return empty array to avoid expensive query
            stats: {
                total,
                newInserts,
                duplicatesUpdated
            }
        };
    }
    // ============= QUERY OPERATIONS =============
    /**
     * Get paginated leads with sorting and filtering
     */
    async getLeadsPaginated(clientId, startDate, endDate, pagination = { page: 1, limit: 50, sortBy: 'date', sortOrder: 'desc' }, filters = {}) {
        const query = {};
        // Client filter
        if (clientId)
            query.clientId = clientId;
        // Date filter - use timezone-aware date range query
        if (startDate || endDate) {
            const dateRange = createDateRangeQuery(startDate, endDate);
            if (dateRange.leadDate) {
                query.leadDate = dateRange.leadDate;
            }
        }
        // Filters
        if (filters.service)
            query.service = filters.service;
        if (filters.adSetName)
            query.adSetName = filters.adSetName;
        if (filters.adName)
            query.adName = filters.adName;
        if (filters.status)
            query.status = filters.status;
        if (filters.unqualifiedLeadReason) {
            query.status = 'unqualified';
            query.unqualifiedLeadReason = filters.unqualifiedLeadReason;
        }
        if (filters.$or) {
            query.$or = filters.$or;
        }
        // Pagination setup
        const skip = (pagination.page - 1) * pagination.limit;
        const sortField = pagination.sortBy === 'score' ? 'leadScore' : 'leadDate';
        const sortOrder = pagination.sortOrder === 'desc' ? -1 : 1;
        const { totalCount, leads } = await this.aggregationRepo.findLeadsWithCount({
            query,
            sortField: sortField,
            sortOrder: sortOrder,
            skip: skip,
            limit: pagination.limit
        });
        const totalPages = Math.max(1, Math.ceil(totalCount / pagination.limit));
        return {
            leads: leads.map(lead => this.normalizeLeadAmounts(lead)),
            pagination: {
                currentPage: pagination.page,
                totalPages,
                totalCount,
                pageSize: pagination.limit,
                hasNext: pagination.page < totalPages,
                hasPrev: pagination.page > 1
            }
        };
    }
    /**
     * Get filter options and status counts
     */
    async fetchLeadFiltersAndCounts(clientId, startDate, endDate) {
        const query = {};
        if (clientId)
            query.clientId = clientId;
        if (startDate || endDate) {
            const dateRange = createDateRangeQuery(startDate, endDate);
            if (dateRange.leadDate) {
                query.leadDate = dateRange.leadDate;
            }
        }
        const { services, adSetNames, adNames, statuses, unqualifiedLeadReasons, statusAgg } = await this.aggregationRepo.getLeadFilterOptionsAndStats(query);
        // Normalize status counts
        const statusCountsMap = statusAgg.reduce((acc, item) => {
            acc[item._id?.toLowerCase() || "unknown"] = item.count;
            return acc;
        }, {});
        const statusCounts = {
            new: statusCountsMap["new"] || 0,
            inProgress: statusCountsMap["in_progress"] || 0,
            estimateSet: statusCountsMap["estimate_set"] || 0,
            unqualified: statusCountsMap["unqualified"] || 0
        };
        return {
            filterOptions: {
                services: services.filter(Boolean).sort(),
                adSetNames: adSetNames.filter(Boolean).sort(),
                adNames: adNames.filter(Boolean).sort(),
                statuses: statuses.filter(Boolean).sort(),
                unqualifiedLeadReasons: unqualifiedLeadReasons.filter(Boolean).sort(),
            },
            statusCounts
        };
    }
    // ============= UTILITY METHODS =============
    /**
     * Find and update a lead by email and clientId, using leadDate to disambiguate if needed
     */
    async findAndUpdateLeadByEmail(params) {
        const { email, clientId, status, unqualifiedLeadReason, proposalAmount, jobBookedAmount, leadDate } = params;
        // Find leads matching email and clientId
        const leads = await this.leadRepo.findLeads({ email, clientId });
        if (!leads || leads.length === 0) {
            throw new Error("No lead found with the provided email and clientId");
        }
        let targetLead;
        if (leads.length > 1) {
            if (!leadDate) {
                throw new Error("Multiple leads found. Please provide leadDate to disambiguate");
            }
            // Match only the date part, ignoring time
            targetLead = leads.find((lead) => {
                // Convert lead's date to YYYY-MM-DD format
                const leadDateOnly = new Date(lead.leadDate).toISOString().split('T')[0];
                // Handle provided date: could be either YYYY-MM-DD or full datetime
                let providedDateOnly;
                try {
                    providedDateOnly = new Date(leadDate).toISOString().split('T')[0];
                }
                catch (error) {
                    throw new Error("Invalid date format. Please provide date in YYYY-MM-DD format");
                }
                return leadDateOnly === providedDateOnly;
            });
            if (!targetLead) {
                throw new Error("No lead found matching the provided leadDate");
            }
        }
        else {
            targetLead = leads[0];
        }
        let leadId;
        if (targetLead && "_id" in targetLead && targetLead._id) {
            leadId = targetLead._id.toString();
        }
        else {
            leadId = "";
        }
        // Get the existing lead to check current status and update statusHistory
        const existingLead = await this.leadRepo.getLeadById(leadId);
        if (!existingLead) {
            throw new Error("Lead not found");
        }
        const oldStatus = existingLead.status;
        const statusChanged = status !== oldStatus;
        // Prepare update data
        const updateData = {
            status,
            // Clear unqualifiedLeadReason if status is not "unqualified"
            unqualifiedLeadReason: status === "unqualified" ? (unqualifiedLeadReason || "") : ""
        };
        // Update statusHistory if status is changing
        if (statusChanged) {
            this.updateStatusHistory(existingLead, status);
            updateData.statusHistory = existingLead.statusHistory;
        }
        // Handle proposalAmount - allowed for: estimate_set, virtual_quote, proposal_presented, job_lost
        if (this.allowsProposalAmount(status)) {
            if (proposalAmount !== undefined) {
                const parsedProposal = Number(proposalAmount);
                updateData.proposalAmount = isFinite(parsedProposal) && parsedProposal >= 0 ? parsedProposal : 0;
            }
        }
        else {
            // Reset if status doesn't allow it
            updateData.proposalAmount = 0;
        }
        // Handle jobBookedAmount - allowed only for: job_booked
        if (this.allowsJobBookedAmount(status)) {
            if (jobBookedAmount !== undefined) {
                const parsedBooked = Number(jobBookedAmount);
                updateData.jobBookedAmount = isFinite(parsedBooked) && parsedBooked >= 0 ? parsedBooked : 0;
            }
        }
        else {
            // Reset if status doesn't allow it
            updateData.jobBookedAmount = 0;
        }
        // Update directly in database
        const updated = await this.leadRepo.updateLead(leadId, updateData);
        if (!updated) {
            throw new Error("Failed to update lead");
        }
        // Send Facebook Conversion API event if status changed to job_booked
        if (statusChanged) {
            await this.sendFacebookConversionEvent(updated, status);
        }
        return updated;
    }
    /**
     * Check if user exists
     */
    async doesUserExist(clientId) {
        if (!mongoose.Types.ObjectId.isValid(clientId)) {
            return false;
        }
        return (await User.exists({ _id: clientId })) !== null;
    }
    /**
     * Check if user has any leads
     */
    async hasLeadData(clientId) {
        if (!mongoose.Types.ObjectId.isValid(clientId)) {
            return false;
        }
        return await this.leadRepo.existsByClientId(clientId);
    }
    /**
     * Get all unique client IDs
     */
    async getAllClientIds() {
        const clientIds = await this.leadRepo.getDistinctClientIds();
        return clientIds.filter(id => id);
    }
    /**
     * Get all leads for a specific client
     */
    async getAllLeadsForClient(clientId) {
        const leads = await this.leadRepo.getLeadsByClientId(clientId);
        return leads.map(lead => this.normalizeLeadAmounts(lead));
    }
    /**
     * Get client activity data combining lead manual updates and weekly report updates
     * Returns categorized inactive clients based on fixed thresholds (most recent to never updated)
     */
    async getClientActivityData() {
        try {
            const now = new Date();
            const wrDays = DISENGAGEMENT.WEEKLY_REPORT_DAYS; // 7 days from config
            const ldDays = DISENGAGEMENT.LEAD_ACTIVITY_DAYS; // 14 days from config
            const wrThreshold = new Date(now.getTime() - (wrDays * 24 * 60 * 60 * 1000)); // Weekly report threshold
            const ldThreshold = new Date(now.getTime() - (ldDays * 24 * 60 * 60 * 1000)); // Lead threshold
            // 1 GET ALL ACTIVE USERS (potential candidates for disengagement check)
            const allUsers = await User.find({ status: { $eq: 'active' }, role: { $eq: 'USER' } }, { _id: 1, email: 1, name: 1, role: 1 }).lean();
            // 2️ Aggregate latest manual lead updates per client (already sorted by latest first)
            const leadActivity = await this.leadRepo.aggregateLeadActivity();
            // 3️ Aggregate latest weekly report updates per client (sorted by latest first)
            const weeklyActivity = await this.actualRepo.aggregateWeeklyActivity();
            // 4️ CREATE LOOKUP MAPS (for fast user activity lookups)
            const leadActivityMap = new Map();
            leadActivity.forEach(item => {
                leadActivityMap.set(item._id.toString(), item.leadLastActiveAt);
            });
            // 5️ Create activity map for weekly data
            const weeklyActivityMap = new Map();
            weeklyActivity.forEach(item => {
                weeklyActivityMap.set(item._id.toString(), item.weeklyReportLastActiveAt);
            });
            // 6️ Categorize disengaged users based on inactivity type
            const disengagedUsersByLeads = [];
            const disengagedUsersByWeeklyReports = [];
            const disengagedUsersByBoth = [];
            allUsers.forEach(user => {
                const clientId = user._id.toString();
                // Get last activity dates for this user
                const leadLastActiveAt = leadActivityMap.get(clientId) || null;
                const weeklyReportLastActiveAt = weeklyActivityMap.get(clientId) || null;
                const clientData = {
                    clientId: clientId,
                    email: user.email || '',
                    name: user.name || '',
                    role: user.role || '',
                    leadLastActiveAt: leadLastActiveAt,
                    weeklyReportLastActiveAt: weeklyReportLastActiveAt
                };
                // 7. CHECK DISENGAGEMENT STATUS
                // User is lead-disengaged if: no lead activity OR activity older than 7 days
                const isLeadInactive = !leadLastActiveAt || leadLastActiveAt < ldThreshold;
                // User is weekly-disengaged if: no weekly reports OR reports older than 14 days
                const isWeeklyInactive = !weeklyReportLastActiveAt || weeklyReportLastActiveAt < wrThreshold;
                // CATEGORIZE USER BASED ON DISENGAGEMENT PATTERN
                if (isLeadInactive && isWeeklyInactive) {
                    // User is disengaged in BOTH areas - most critical
                    disengagedUsersByBoth.push(clientData);
                }
                if (isLeadInactive) {
                    // User hasn't managed leads recently (includes 'both' users)
                    disengagedUsersByLeads.push(clientData);
                }
                if (isWeeklyInactive) {
                    // User hasn't submitted weekly reports recently (includes 'both' users)
                    disengagedUsersByWeeklyReports.push(clientData);
                }
            });
            // 8️ Sort all categories by latest activity (most recent disengagement first)
            const sortByLatestActivity = (a, b) => {
                const aLatest = this.getLatestActivityDate(a.leadLastActiveAt, a.weeklyReportLastActiveAt);
                const bLatest = this.getLatestActivityDate(b.leadLastActiveAt, b.weeklyReportLastActiveAt);
                // Handle users with no activity (put them last)
                if (!aLatest && !bLatest)
                    return 0;
                if (!aLatest)
                    return 1;
                if (!bLatest)
                    return -1;
                // Sort by most recent activity first
                return bLatest.getTime() - aLatest.getTime();
            };
            disengagedUsersByLeads.sort(sortByLatestActivity);
            disengagedUsersByWeeklyReports.sort(sortByLatestActivity);
            disengagedUsersByBoth.sort(sortByLatestActivity);
            return {
                disengagedUsersByLeads,
                disengagedUsersByWeeklyReports,
                disengagedUsersByBoth
            };
        }
        catch (error) {
            console.error('Error fetching client activity data:', error);
            throw new Error('Failed to fetch client activity data');
        }
    }
    /**
     * Helper method to get the latest activity date between lead and weekly report activities
     */
    getLatestActivityDate(leadDate, weeklyDate) {
        if (!leadDate && !weeklyDate)
            return null;
        if (!leadDate)
            return weeklyDate;
        if (!weeklyDate)
            return leadDate;
        return leadDate > weeklyDate ? leadDate : weeklyDate;
    }
    // ============= HELPER METHODS =============
    /**
     * Normalize lead amounts by returning 0 for proposalAmount and jobBookedAmount if they don't exist or are invalid
     */
    normalizeLeadAmounts(lead) {
        const normalizeAmount = (value) => {
            if (typeof value === 'number' && isFinite(value) && value >= 0) {
                return value;
            }
            return 0;
        };
        return {
            ...lead,
            proposalAmount: normalizeAmount(lead.proposalAmount),
            jobBookedAmount: normalizeAmount(lead.jobBookedAmount)
        };
    }
}
// Add this utility function in LeadService.ts or a utils file
function createDateRangeQuery(startDate, endDate) {
    if (!startDate && !endDate) {
        return {};
    }
    const result = {};
    if (startDate) {
        if (!result.leadDate)
            result.leadDate = {};
        result.leadDate.$gte = startDate;
    }
    if (endDate) {
        if (!result.leadDate)
            result.leadDate = {};
        result.leadDate.$lte = endDate;
    }
    return result;
}
