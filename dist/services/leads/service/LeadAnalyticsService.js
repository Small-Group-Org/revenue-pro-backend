import { leadRepository } from "../repository/LeadRepository.js";
import { leadAggregationRepository } from "../repository/LeadAggregationRepository.js";
import { ANALYTICS } from "../utils/config.js";
export class LeadAnalyticsService {
    constructor(leadRepo = leadRepository, aggregationRepo = leadAggregationRepository) {
        this.leadRepo = leadRepo;
        this.aggregationRepo = aggregationRepo;
    }
    // ============= MAIN ANALYTICS METHODS =============
    /**
     * Get comprehensive lead analytics for a client
     */
    async getLeadAnalytics(clientId, startDate, endDate, sort) {
        // Build query with clientId and date range
        const query = { clientId };
        // Directly use startDate and endDate as UTC ISO strings
        if (startDate || endDate) {
            query.leadDate = {};
            if (startDate)
                query.leadDate.$gte = startDate;
            if (endDate)
                query.leadDate.$lte = endDate;
        }
        // Fetch filtered leads
        const leads = await this.leadRepo.findLeads(query);
        if (leads.length === 0) {
            return this.getEmptyAnalyticsResult();
        }
        // Process analytics
        const analytics = await this.processLeadAnalytics(leads, sort);
        return analytics;
    }
    /**
     * Get performance tables with pagination
     */
    async getPerformanceTables(clientId, startDate, endDate, adSetPage = 1, adNamePage = 1, adSetItemsPerPage = 15, adNameItemsPerPage = 10, sortOptions) {
        // Build query with clientId and date range
        const query = { clientId };
        // Directly use startDate and endDate as UTC ISO strings
        if (startDate || endDate) {
            query.leadDate = {};
            if (startDate)
                query.leadDate.$gte = startDate;
            if (endDate)
                query.leadDate.$lte = endDate;
        }
        // Use aggregation pipelines for better performance
        const [adSetResults, adNameResults] = await Promise.all([
            this.getAdSetPerformanceWithPagination(query, adSetPage, adSetItemsPerPage, sortOptions),
            this.getAdNamePerformanceWithPagination(query, adNamePage, adNameItemsPerPage, sortOptions)
        ]);
        return {
            adSetData: adSetResults,
            adNameData: adNameResults
        };
    }
    /**
     * Get aggregated lead analytics across ALL clients
     * Returns single aggregated dayOfWeekData and unqualifiedReasons for the entire date range
     */
    async getAggregatedLeadAnalytics(startDate, endDate) {
        // Build query without clientId (all clients)
        const query = {};
        // Add date range filter
        if (startDate || endDate) {
            query.leadDate = {};
            if (startDate)
                query.leadDate.$gte = startDate;
            if (endDate)
                query.leadDate.$lte = endDate;
        }
        // Fetch all leads for the date range
        const allLeads = await this.leadRepo.findLeads(query);
        if (allLeads.length === 0) {
            return {
                dayOfWeekData: [],
                unqualifiedReasons: []
            };
        }
        // Calculate aggregated dayOfWeekData for all leads
        const dayOfWeekData = await this.processDayOfWeekAnalysis(allLeads);
        // Calculate aggregated unqualifiedReasons for all leads
        const unqualifiedLeads = allLeads.filter(lead => lead.status === 'unqualified');
        const unqualifiedCount = unqualifiedLeads.length;
        const unqualifiedReasons = await this.processUnqualifiedReasonsAnalysis(unqualifiedLeads, unqualifiedCount);
        // Filter out unqualified reasons with count less than 50
        const filteredUnqualifiedReasons = unqualifiedReasons.filter(reason => reason.totalLeads >= 50);
        return {
            dayOfWeekData,
            unqualifiedReasons: filteredUnqualifiedReasons
        };
    }
    // ============= PRIVATE ANALYTICS PROCESSORS =============
    /**
     * Process lead analytics using aggregation
     */
    async processLeadAnalytics(leads, sort) {
        const totalLeads = leads.length;
        // Count qualified statuses: estimate_set, virtual_quote, proposal_presented, job_booked
        const estimateSetCount = leads.filter(lead => lead.status === 'estimate_set' ||
            lead.status === 'virtual_quote' ||
            lead.status === 'proposal_presented' ||
            lead.status === 'job_booked').length;
        // Count unqualified statuses: unqualified, estimate_canceled, job_lost
        const unqualifiedCount = leads.filter(lead => lead.status === 'unqualified' ||
            lead.status === 'estimate_canceled' ||
            lead.status === 'job_lost').length;
        // Process each analytics section in parallel
        const [zipData, serviceData, dayOfWeekData, ulrData] = await Promise.all([
            this.processZipAnalysis(leads, sort),
            this.processServiceAnalysis(leads),
            this.processDayOfWeekAnalysis(leads),
            this.processUnqualifiedReasonsAnalysis(leads.filter(lead => lead.status === 'unqualified' ||
                lead.status === 'estimate_canceled' ||
                lead.status === 'job_lost'), unqualifiedCount)
        ]);
        return {
            overview: { totalLeads, estimateSetCount, unqualifiedCount },
            zipData,
            serviceData,
            dayOfWeekData,
            ulrData
        };
    }
    /**
     * Process ZIP code analysis
     */
    async processZipAnalysis(leads, sort) {
        // Group by zip
        const zipGroups = {};
        for (const lead of leads) {
            if (!lead.zip)
                continue;
            if (!zipGroups[lead.zip]) {
                zipGroups[lead.zip] = {
                    estimateSet: 0,
                    unqualified: 0,
                    virtualQuote: 0,
                    estimateCanceled: 0,
                    proposalPresented: 0,
                    jobBooked: 0,
                    jobLost: 0,
                    totalJobBookedAmount: 0,
                    totalProposalAmount: 0
                };
            }
            if (lead.status === 'estimate_set')
                zipGroups[lead.zip].estimateSet += 1;
            if (lead.status === 'virtual_quote')
                zipGroups[lead.zip].virtualQuote += 1;
            if (lead.status === 'proposal_presented')
                zipGroups[lead.zip].proposalPresented += 1;
            if (lead.status === 'job_booked')
                zipGroups[lead.zip].jobBooked += 1;
            if (lead.status === 'unqualified')
                zipGroups[lead.zip].unqualified += 1;
            if (lead.status === 'estimate_canceled')
                zipGroups[lead.zip].estimateCanceled += 1;
            if (lead.status === 'job_lost')
                zipGroups[lead.zip].jobLost += 1;
            // Add job booked amount data
            if (lead.jobBookedAmount && lead.jobBookedAmount > 0) {
                zipGroups[lead.zip].totalJobBookedAmount += lead.jobBookedAmount;
            }
            // Add proposal amount data
            if (lead.proposalAmount && lead.proposalAmount > 0) {
                zipGroups[lead.zip].totalProposalAmount += lead.proposalAmount;
            }
        }
        const zipResults = Object.entries(zipGroups)
            .map(([zip, { estimateSet, unqualified, virtualQuote, estimateCanceled, proposalPresented, jobBooked, jobLost, totalJobBookedAmount, totalProposalAmount }]) => {
            const netEstimates = estimateSet + virtualQuote + proposalPresented + jobBooked;
            const netUnqualifieds = unqualified + estimateCanceled + jobLost;
            const denominator = netEstimates + netUnqualifieds;
            return {
                zip,
                estimateSetCount: estimateSet,
                estimateSetRate: denominator > 0 ? ((netEstimates / denominator) * 100).toFixed(1) : '0.0',
                jobBookedAmount: Math.round(totalJobBookedAmount * 100) / 100,
                proposalAmount: Math.round(totalProposalAmount * 100) / 100
            };
        });
        // Apply sorting based on sort parameter
        if (sort === 'jobBooked_zip') {
            return zipResults.sort((a, b) => b.jobBookedAmount - a.jobBookedAmount);
        }
        else {
            return zipResults.sort((a, b) => b.estimateSetCount - a.estimateSetCount);
        }
    }
    /**
     * Process service analysis
     */
    async processServiceAnalysis(leads) {
        // Calculate total qualified leads (netEstimates) for the client
        const clientEstimateSetCount = leads.filter(lead => lead.status === 'estimate_set' ||
            lead.status === 'virtual_quote' ||
            lead.status === 'proposal_presented' ||
            lead.status === 'job_booked').length;
        const serviceGroups = {};
        for (const lead of leads) {
            if (!lead.service)
                continue;
            if (!serviceGroups[lead.service]) {
                serviceGroups[lead.service] = {
                    estimateSet: 0,
                    unqualified: 0,
                    virtualQuote: 0,
                    estimateCanceled: 0,
                    proposalPresented: 0,
                    jobBooked: 0,
                    jobLost: 0
                };
            }
            if (lead.status === 'estimate_set')
                serviceGroups[lead.service].estimateSet += 1;
            if (lead.status === 'virtual_quote')
                serviceGroups[lead.service].virtualQuote += 1;
            if (lead.status === 'proposal_presented')
                serviceGroups[lead.service].proposalPresented += 1;
            if (lead.status === 'job_booked')
                serviceGroups[lead.service].jobBooked += 1;
            if (lead.status === 'unqualified')
                serviceGroups[lead.service].unqualified += 1;
            if (lead.status === 'estimate_canceled')
                serviceGroups[lead.service].estimateCanceled += 1;
            if (lead.status === 'job_lost')
                serviceGroups[lead.service].jobLost += 1;
        }
        return Object.entries(serviceGroups)
            .map(([service, { estimateSet, unqualified, virtualQuote, estimateCanceled, proposalPresented, jobBooked, jobLost }]) => {
            // estimateSetRate: netEstimates / (netEstimates + netUnqualifieds)
            // percentage: netEstimatesOfService / TotalNetEstimates
            const netEstimates = estimateSet + virtualQuote + proposalPresented + jobBooked;
            const netUnqualifieds = unqualified + estimateCanceled + jobLost;
            const denominator = netEstimates + netUnqualifieds;
            return {
                service,
                estimateSetCount: estimateSet,
                estimateSetRate: denominator > 0 ? ((netEstimates / denominator) * 100).toFixed(1) : '0.0',
                percentage: clientEstimateSetCount > 0 ? ((netEstimates / clientEstimateSetCount) * 100).toFixed(1) : '0.0'
            };
        })
            .sort((a, b) => b.estimateSetCount - a.estimateSetCount);
    }
    /**
     * Process day of week analysis
     */
    async processDayOfWeekAnalysis(leads) {
        const dayOfWeekAnalysis = leads.reduce((acc, lead) => {
            if (!lead.leadDate) {
                return acc; // Skip if no date
            }
            const dt = new Date(lead.leadDate);
            if (isNaN(dt.getTime())) {
                return acc; // Skip if invalid date
            }
            const dayOfWeek = dt.toLocaleDateString('en-US', { weekday: 'long' });
            if (!acc[dayOfWeek]) {
                acc[dayOfWeek] = {
                    total: 0,
                    estimateSet: 0,
                    unqualified: 0,
                    virtualQuote: 0,
                    estimateCanceled: 0,
                    proposalPresented: 0,
                    jobBooked: 0,
                    jobLost: 0
                };
            }
            acc[dayOfWeek].total += 1;
            if (lead.status === 'estimate_set') {
                acc[dayOfWeek].estimateSet += 1;
            }
            if (lead.status === 'virtual_quote') {
                acc[dayOfWeek].virtualQuote += 1;
            }
            if (lead.status === 'proposal_presented') {
                acc[dayOfWeek].proposalPresented += 1;
            }
            if (lead.status === 'job_booked') {
                acc[dayOfWeek].jobBooked += 1;
            }
            if (lead.status === 'unqualified') {
                acc[dayOfWeek].unqualified += 1;
            }
            if (lead.status === 'estimate_canceled') {
                acc[dayOfWeek].estimateCanceled += 1;
            }
            if (lead.status === 'job_lost') {
                acc[dayOfWeek].jobLost += 1;
            }
            return acc;
        }, {});
        return Object.entries(dayOfWeekAnalysis)
            .map(([day, data]) => {
            const netEstimates = data.estimateSet + data.virtualQuote + data.proposalPresented + data.jobBooked;
            const netUnqualifieds = data.unqualified + data.estimateCanceled + data.jobLost;
            return {
                day,
                totalLeads: data.total,
                estimateSetCount: data.estimateSet,
                estimateSetRate: (netEstimates + netUnqualifieds) > 0
                    ? ((netEstimates / (netEstimates + netUnqualifieds)) * 100).toFixed(1)
                    : '0.0'
            };
        })
            .sort((a, b) => {
            return ANALYTICS.DAY_ORDER.indexOf(a.day) - ANALYTICS.DAY_ORDER.indexOf(b.day);
        });
    }
    /**
     * Process unqualified reasons analysis
     */
    async processUnqualifiedReasonsAnalysis(unqualifiedLeads, unqualifiedCount) {
        const ulrAnalysis = unqualifiedLeads
            .filter(lead => lead.unqualifiedLeadReason)
            .reduce((acc, lead) => {
            const reason = lead.unqualifiedLeadReason;
            acc[reason] = (acc[reason] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(ulrAnalysis)
            .map(([reason, count]) => ({
            reason,
            totalLeads: count,
            percentage: unqualifiedCount > 0 ? ((count / unqualifiedCount) * 100).toFixed(1) : '0.0'
        }))
            .sort((a, b) => b.totalLeads - a.totalLeads);
    }
    // ============= PERFORMANCE METHODS =============
    /**
     * Get Ad Set performance with pagination
     */
    async getAdSetPerformanceWithPagination(query, page, limit, sortOptions) {
        const { totalCount, data } = await this.aggregationRepo.getAdSetPerformance(query, page, limit, sortOptions);
        const totalPages = Math.ceil(totalCount / limit);
        return {
            data: data.map(item => ({
                ...item,
                estimateSetRate: item.percentage.toFixed(1),
                percentage: undefined,
            })),
            pagination: {
                currentPage: page,
                totalPages: Math.max(1, totalPages),
                totalCount,
                pageSize: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
    }
    /**
     * Get Ad Name performance with pagination
     */
    async getAdNamePerformanceWithPagination(query, page, limit, sortOptions) {
        const { totalCount, data } = await this.aggregationRepo.getAdNamePerformance(query, page, limit, sortOptions);
        const totalPages = Math.ceil(totalCount / limit);
        return {
            data: data.map(item => ({
                ...item,
                estimateSetRate: item.percentage.toFixed(1),
                percentage: undefined,
            })),
            pagination: {
                currentPage: page,
                totalPages: Math.max(1, totalPages),
                totalCount,
                pageSize: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
    }
    // ============= HELPER METHODS =============
    /**
     * Get empty analytics result
     */
    getEmptyAnalyticsResult() {
        return {
            overview: { totalLeads: 0, estimateSetCount: 0, unqualifiedCount: 0 },
            zipData: [],
            serviceData: [],
            dayOfWeekData: [],
            ulrData: []
        };
    }
}
