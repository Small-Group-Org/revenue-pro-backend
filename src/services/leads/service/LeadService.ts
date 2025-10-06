import { ILead, ILeadDocument } from "../domain/leads.domain.js";
import { ILeadRepository, ILeadAggregationRepository } from "../repository/interfaces.js";
import { leadRepository } from "../repository/LeadRepository.js";
import { leadAggregationRepository } from "../repository/LeadAggregationRepository.js";
import { TimezoneUtils } from "../../../utils/timezoneUtils.js";
import mongoose from "mongoose";
import User from "../../user/repository/models/user.model.js";

// Types for service operations
interface PaginationOptions {
  page: number;
  limit: number;
  sortBy: 'date' | 'score';
  sortOrder: 'asc' | 'desc';
}

interface FilterOptions {
  service?: string;
  adSetName?: string;
  adName?: string;
  status?: string;
  unqualifiedLeadReason?: string;
  name?: string
}

interface PaginatedLeadsResult {
  leads: Partial<ILead>[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface BulkCreateResult {
  documents: ILeadDocument[];
  stats: {
    total: number;
    newInserts: number;
    duplicatesUpdated: number;
  };
}

export class LeadService {
  
  constructor(
    private leadRepo: ILeadRepository = leadRepository,
    private aggregationRepo: ILeadAggregationRepository = leadAggregationRepository
  ) {}

  // ============= BASIC CRUD OPERATIONS =============


  /**
   * Update a lead by ID
   */
  async updateLead(
    id: string,
    data: Partial<Pick<ILead, "status" | "unqualifiedLeadReason" | "proposalAmount" | "jobBookedAmount">>
  ): Promise<ILeadDocument> {
    const existing = await this.leadRepo.getLeadById(id);
    if (!existing) throw new Error("Lead not found");

    if (data.status) {
      existing.status = data.status;
      // Clear unqualifiedLeadReason if status is not "unqualified"
      if (data.status !== 'unqualified') {
        existing.unqualifiedLeadReason = '';
      }
      
      // Reset proposal and job amounts if status is not "estimate_set"
      // But preserve existing values if status is changing TO estimate_set
      if (data.status !== 'estimate_set') {
        existing.proposalAmount = 0;
        existing.jobBookedAmount = 0;
      }
    }

    if (data.unqualifiedLeadReason) {
      existing.unqualifiedLeadReason = data.unqualifiedLeadReason;
    }

    // Only allow proposalAmount and jobBookedAmount to be set when status is "estimate_set"
    if (existing.status === 'estimate_set') {
      if (data.proposalAmount !== undefined) {
        const parsedProposal = Number(data.proposalAmount);
        existing.proposalAmount = isFinite(parsedProposal) && parsedProposal >= 0 ? parsedProposal : 0;
      }
      if (data.jobBookedAmount !== undefined) {
        const parsedBooked = Number(data.jobBookedAmount);
        existing.jobBookedAmount = isFinite(parsedBooked) && parsedBooked >= 0 ? parsedBooked : 0;
      }
    } else {
      // Warn if user tries to set amounts when status doesn't allow it
      if (data.proposalAmount !== undefined || data.jobBookedAmount !== undefined) {
        throw new Error("proposalAmount and jobBookedAmount can only be set when status is 'estimate_set'");
      }
    }

    await existing.save();
    return existing;
  }

  /**
   * Soft delete multiple leads
   */
  async deleteLeads(ids: string[]): Promise<{ deletedCount: number }> {
    const result = await this.leadRepo.bulkDeleteLeads(ids);
    return { deletedCount: result.modifiedCount || 0 };
  }

  /**
   * Upsert a lead (update if exists, create if not)
   */
  async upsertLead(
    query: Pick<ILeadDocument, "clientId" | "email" | "phone" | "service" | "zip">, 
    payload: Partial<ILeadDocument>
  ): Promise<ILeadDocument> {
    const existingLead: Partial<ILead> | null = (await this.leadRepo.findLeads(query))[0] || null;
    
    if (existingLead) {
      const updatePayload = { ...payload };
      updatePayload.leadScore = existingLead.leadScore;
      updatePayload.conversionRates = existingLead.conversionRates;
      
      // Handle proposalAmount and jobBookedAmount based on status
      if (updatePayload.status !== 'estimate_set') {
        updatePayload.proposalAmount = 0;
        updatePayload.jobBookedAmount = 0;
      }
      
      const result = await this.leadRepo.updateLead(query, updatePayload);
      if (!result) throw new Error("Failed to update lead");
      return this.normalizeLeadAmounts(result);
    } else {
      if (!payload.clientId || !payload.service || !payload.zip || (!payload.phone && !payload.email)) {
        throw new Error('Missing required fields: clientId, service, zip, and at least phone or email');
      }
      
      const newLeadPayload = { ...payload };
      // Note: Lead scoring will be handled by LeadScoringService
      newLeadPayload.leadScore = 0;
      newLeadPayload.conversionRates = {};
      
      // Initialize proposalAmount and jobBookedAmount based on status
      newLeadPayload.proposalAmount = newLeadPayload.status === 'estimate_set' ? (newLeadPayload.proposalAmount ?? 0) : 0;
      newLeadPayload.jobBookedAmount = newLeadPayload.status === 'estimate_set' ? (newLeadPayload.jobBookedAmount ?? 0) : 0;

      return await this.leadRepo.upsertLead(query, newLeadPayload);
    }
  }

  // ============= BULK OPERATIONS =============

  /**
   * Bulk create leads with optional duplicate prevention
   */
  async bulkCreateLeads(
    payloads: ILead[], 
    uniquenessByPhoneEmail: boolean = false
  ): Promise<BulkCreateResult> {
    if (payloads.length === 0) return { 
      documents: [], 
      stats: { total: 0, newInserts: 0, duplicatesUpdated: 0 }
    };


    // Build operations based on uniqueness flag
    const bulkOps = payloads.map(lead => {
      const filter: any = { clientId: lead.clientId };
      
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
        } else if (hasEmail) {
          filter.email = lead.email;
        } else if (hasPhone) {
          filter.phone = lead.phone;
        } else {
          // Neither email nor phone exist: force new document
          filter._id = new Date().getTime() + Math.random();
        }
      } else {
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
  async getLeadsPaginated(
    clientId?: string,
    startDate?: string,
    endDate?: string,
    pagination: PaginationOptions = { page: 1, limit: 50, sortBy: 'date', sortOrder: 'desc' },
    filters: FilterOptions = {},
  ): Promise<PaginatedLeadsResult> {
    const query: any = {};

    // Client filter
    if (clientId) query.clientId = clientId;

    // Date filter - use timezone-aware date range query
    if (startDate || endDate) {
      const dateRange = createDateRangeQuery(startDate, endDate);
      if (dateRange.leadDate) {
        query.leadDate = dateRange.leadDate;
      }
    }

    // Filters
    if (filters.service) query.service = filters.service;
    if (filters.adSetName) query.adSetName = filters.adSetName
    if (filters.adName) query.adName = filters.adName
    if (filters.status) query.status = filters.status;
    if (filters.unqualifiedLeadReason) {
      query.status = 'unqualified';
      query.unqualifiedLeadReason = filters.unqualifiedLeadReason;
    }
    if (filters.name) query.name = filters.name;

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
  async fetchLeadFiltersAndCounts(
    clientId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    filterOptions: {
      services: string[];
      adSetNames: string[];
      adNames: string[];
      statuses: string[];
      unqualifiedLeadReasons: string[];
    };
    statusCounts: {
      new: number;
      inProgress: number;
      estimateSet: number;
      unqualified: number;
    };
  }> {
    const query: any = {};
    if (clientId) query.clientId = clientId;

    if (startDate || endDate) {
      const dateRange = createDateRangeQuery(startDate, endDate);
      if (dateRange.leadDate) {
        query.leadDate = dateRange.leadDate;
      }
    }

    const { 
      services, 
      adSetNames, 
      adNames, 
      statuses, 
      unqualifiedLeadReasons, 
      statusAgg 
    } = await this.aggregationRepo.getLeadFilterOptionsAndStats(query);

    // Normalize status counts
    const statusCountsMap = statusAgg.reduce((acc, item) => {
      acc[item._id?.toLowerCase() || "unknown"] = item.count;
      return acc;
    }, {} as Record<string, number>);

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
  async findAndUpdateLeadByEmail(
    email: string,
    clientId: string,
    status: string,
    unqualifiedLeadReason?: string,
    leadDate?: string
  ): Promise<ILeadDocument> {
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

      // Find exact UTC string match
      targetLead = leads.find((lead: any) => lead.leadDate?.toString() === leadDate);
      if (!targetLead) {
        throw new Error("No lead found matching the provided leadDate");
      }
    } else {
      targetLead = leads[0];
    }

    let leadId: string;
    if (targetLead && "_id" in targetLead && targetLead._id) {
      leadId = targetLead._id.toString();
    } else {
      leadId = ""
    }

    // Prepare update data - only status and unqualifiedLeadReason
    const updateData: any = {
      status,
      // Clear unqualifiedLeadReason if status is not "unqualified"
      unqualifiedLeadReason: status === "unqualified" ? (unqualifiedLeadReason || "") : ""
    };

    // Update directly in database
    const updated = await this.leadRepo.updateLead(
      leadId,
      updateData
    );
    
    if (!updated) {
      throw new Error("Failed to update lead");
    }
    
    return updated;
  }

  /**
   * Check if user exists
   */
  async doesUserExist(clientId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return false;
    }
    return (await User.exists({ _id: clientId })) !== null;
  }

  /**
   * Check if user has any leads
   */
  async hasLeadData(clientId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return false;
    }
    return await this.leadRepo.existsByClientId(clientId);
  }

  /**
   * Get all unique client IDs
   */
  async getAllClientIds(): Promise<string[]> {
    const clientIds = await this.leadRepo.getDistinctClientIds();
    return clientIds.filter(id => id);
  }

  /**
   * Get all leads for a specific client
   */
  async getAllLeadsForClient(clientId: string): Promise<ILead[]> {
    const leads = await this.leadRepo.getLeadsByClientId(clientId);
    return leads.map(lead => this.normalizeLeadAmounts(lead)) as ILead[];
  }

  // ============= HELPER METHODS =============

  /**
   * Normalize lead amounts by returning 0 for proposalAmount and jobBookedAmount if they don't exist or are invalid
   */
  private normalizeLeadAmounts(lead: any): any {
    const normalizeAmount = (value: any): number => {
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
function createDateRangeQuery(startDate?: string, endDate?: string): { leadDate?: { $gte?: string; $lte?: string } } {
  if (!startDate && !endDate) {
    return {};
  }
  const result: { leadDate?: { $gte?: string; $lte?: string } } = {};
  if (startDate) {
    if (!result.leadDate) result.leadDate = {};
    result.leadDate.$gte = startDate;
  }
  if (endDate) {
    if (!result.leadDate) result.leadDate = {};
    result.leadDate.$lte = endDate;
  }
  return result;
}
