import { ILead } from "../domain/leads.domain.js";
import { ILeadRepository, ILeadAggregationRepository } from "../repository/interfaces.js";
import { leadRepository } from "../repository/LeadRepository.js";
import { leadAggregationRepository } from "../repository/LeadAggregationRepository.js";
import { ANALYTICS } from "../utils/config.js";

interface AnalyticsResult {
  overview: {
    totalLeads: number;
    estimateSetCount: number;
    unqualifiedCount: number;
    estimateSetRate: string;
    estimateSetPercent: string;
  };
  zipData: Array<{ zip: string; estimateSetCount: number; estimateSetRate: string; jobBookedAmount: number; proposalAmount: number }>;
  serviceData: Array<{ service: string; estimateSetCount: number; estimateSetRate: string }>;
  dayOfWeekData: Array<{ day: string; totalLeads: number; estimateSetCount: number; estimateSetRate: string }>;
  ulrData: Array<{ reason: string; totalLeads: number; percentage: string }>;
}

interface PaginatedPerformanceResult {
  adSetData: {
    data: Array<{ adSetName: string; total: number; estimateSet: number; percentage: string; jobBookedAmount: number; proposalAmount: number }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      pageSize: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
  adNameData: {
    data: Array<{ adName: string; adSetName: string; total: number; estimateSet: number; percentage: string; jobBookedAmount: number; proposalAmount: number }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      pageSize: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

export class LeadAnalyticsService {
  
  constructor(
    private leadRepo: ILeadRepository = leadRepository,
    private aggregationRepo: ILeadAggregationRepository = leadAggregationRepository
  ) {}

  // ============= MAIN ANALYTICS METHODS =============

  /**
   * Get comprehensive lead analytics for a client
   */
  async getLeadAnalytics(
    clientId: string,
    startDate?: string,
    endDate?: string,
    sort?: string
  ): Promise<AnalyticsResult> {
    // Build query with clientId and date range
    const query: any = { clientId };

    // Directly use startDate and endDate as UTC ISO strings
    if (startDate || endDate) {
      query.leadDate = {};
      if (startDate) query.leadDate.$gte = startDate;
      if (endDate) query.leadDate.$lte = endDate;
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
  async getPerformanceTables(
    clientId: string,
    startDate?: string,
    endDate?: string,
    adSetPage: number = 1,
    adNamePage: number = 1,
    adSetItemsPerPage: number = 15,
    adNameItemsPerPage: number = 10,
    sortOptions?: {
      adSetSortField?: 'adSetName' | 'total' | 'estimateSet' | 'percentage' | 'jobBookedAmount' | 'proposalAmount';
      adSetSortOrder?: 'asc' | 'desc';
      adNameSortField?: 'adName' | 'total' | 'estimateSet' | 'percentage' | 'jobBookedAmount' | 'proposalAmount';
      adNameSortOrder?: 'asc' | 'desc';
      showTopRanked?: boolean;
    }
  ): Promise<PaginatedPerformanceResult> {
    // Build query with clientId and date range
    const query: any = { clientId };

    // Directly use startDate and endDate as UTC ISO strings
    if (startDate || endDate) {
      query.leadDate = {};
      if (startDate) query.leadDate.$gte = startDate;
      if (endDate) query.leadDate.$lte = endDate;
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

  // ============= PRIVATE ANALYTICS PROCESSORS =============

  /**
   * Process lead analytics using aggregation
   */
  private async processLeadAnalytics(leads: any[], sort?: string): Promise<AnalyticsResult> {
    const totalLeads = leads.length;
    const estimateSetCount = leads.filter(lead => lead.status === 'estimate_set').length;
    const unqualifiedCount = leads.filter(lead => lead.status === 'unqualified').length;
    let estimateSetRate = ((estimateSetCount / (unqualifiedCount + estimateSetCount)) * 100).toFixed(1);
    if (isNaN(Number(estimateSetRate))) {
      estimateSetRate = '0.0';
    }
    let estimateSetPercent = totalLeads > 0 ? ((estimateSetCount / totalLeads) * 100).toFixed(1) : '0.0';

    // Process each analytics section in parallel
    const [zipData, serviceData, dayOfWeekData, ulrData] = await Promise.all([
      this.processZipAnalysis(leads, sort),
      this.processServiceAnalysis(leads),
      this.processDayOfWeekAnalysis(leads),
      this.processUnqualifiedReasonsAnalysis(
        leads.filter(lead => lead.status === 'unqualified'),
        unqualifiedCount
      )
    ]);

    return {
      overview: { totalLeads, estimateSetCount, unqualifiedCount, estimateSetRate, estimateSetPercent },
      zipData,
      serviceData,
      dayOfWeekData,
      ulrData
    };
  }

  /**
   * Process ZIP code analysis
   */
  private async processZipAnalysis(leads: any[], sort?: string) {
    // Group by zip
    const zipGroups: Record<string, { estimateSet: number; unqualified: number; totalJobBookedAmount: number; totalProposalAmount: number }> = {};
    for (const lead of leads) {
      if (!lead.zip) continue;
      if (!zipGroups[lead.zip]) {
        zipGroups[lead.zip] = { estimateSet: 0, unqualified: 0, totalJobBookedAmount: 0, totalProposalAmount: 0 };
      }
      if (lead.status === 'estimate_set') zipGroups[lead.zip].estimateSet += 1;
      if (lead.status === 'unqualified') zipGroups[lead.zip].unqualified += 1;
      
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
      .map(([zip, { estimateSet, unqualified, totalJobBookedAmount, totalProposalAmount }]) => {
        const denominator = estimateSet + unqualified;
        return {
          zip,
          estimateSetCount: estimateSet,
          estimateSetRate: denominator > 0 ? ((estimateSet / denominator) * 100).toFixed(1) : '0.0',
          jobBookedAmount: Math.round(totalJobBookedAmount * 100) / 100,
          proposalAmount: Math.round(totalProposalAmount * 100) / 100
        };
      });

    // Apply sorting based on sort parameter
    if (sort === 'jobBooked_zip') {
      return zipResults.sort((a, b) => b.jobBookedAmount - a.jobBookedAmount);
    } else {
      return zipResults.sort((a, b) => b.estimateSetCount - a.estimateSetCount);
    }
  }

  /**
   * Process service analysis
   */
  private async processServiceAnalysis(leads: any[]) {
    // Calculate total estimate_set for the client
    const clientEstimateSetCount = leads.filter(lead => lead.status === 'estimate_set').length;
    const serviceGroups: Record<string, { estimateSet: number; unqualified: number }> = {};
    for (const lead of leads) {
      if (!lead.service) continue;
      if (!serviceGroups[lead.service]) serviceGroups[lead.service] = { estimateSet: 0, unqualified: 0 };
      if (lead.status === 'estimate_set') serviceGroups[lead.service].estimateSet += 1;
      if (lead.status === 'unqualified') serviceGroups[lead.service].unqualified += 1;
    }
    return Object.entries(serviceGroups)
      .map(([service, { estimateSet, unqualified }]) => {
        // estimateSetRate: ratio of estimate_set to (estimate_set + unqualified)
        //percentage: estimateSetOfService/TotalEstimateSet
        const denominator = estimateSet + unqualified;
        return {
          service,
          estimateSetCount: estimateSet,
          estimateSetRate: denominator > 0 ? ((estimateSet / denominator) * 100).toFixed(1) : '0.0',
          percentage: clientEstimateSetCount > 0 ? ((estimateSet / clientEstimateSetCount) * 100).toFixed(1) : '0.0'
        };
      })
      .sort((a, b) => b.estimateSetCount - a.estimateSetCount);
  }

  /**
   * Process day of week analysis
   */
  private async processDayOfWeekAnalysis(leads: any[]) {
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
        acc[dayOfWeek] = { total: 0, estimateSet: 0, unqualified: 0 };
      }
      acc[dayOfWeek].total += 1;
      if (lead.status === 'estimate_set') {
        acc[dayOfWeek].estimateSet += 1;
      }
      if (lead.status === 'unqualified') {
        acc[dayOfWeek].unqualified += 1;
      }
      return acc;
    }, {});

    return Object.entries(dayOfWeekAnalysis)
      .map(([day, data]: [string, any]) => ({
        day,
        totalLeads: data.total,
        estimateSetCount: data.estimateSet,
        estimateSetRate: (data.estimateSet + data.unqualified) > 0
          ? ((data.estimateSet / (data.estimateSet + data.unqualified)) * 100).toFixed(1)
          : '0.0'
      }))
      .sort((a, b) => {
        return ANALYTICS.DAY_ORDER.indexOf(a.day as any) - ANALYTICS.DAY_ORDER.indexOf(b.day as any);
      });
  }


  /**
   * Process unqualified reasons analysis
   */
  private async processUnqualifiedReasonsAnalysis(unqualifiedLeads: any[], unqualifiedCount: number) {
    const ulrAnalysis = unqualifiedLeads
      .filter(lead => lead.unqualifiedLeadReason)
      .reduce((acc, lead) => {
        const reason = lead.unqualifiedLeadReason;
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});

    return Object.entries(ulrAnalysis)
      .map(([reason, count]: [string, any]) => ({
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
  private async getAdSetPerformanceWithPagination(
    query: any, 
    page: number, 
    limit: number, 
    sortOptions?: any
  ): Promise<{
    data: Array<{ adSetName: string; total: number; estimateSet: number; percentage: string; jobBookedAmount: number; proposalAmount: number }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      pageSize: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const { totalCount, data } = await this.aggregationRepo.getAdSetPerformance(
      query, 
      page, 
      limit, 
      sortOptions
    );

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
  private async getAdNamePerformanceWithPagination(
    query: any, 
    page: number, 
    limit: number, 
    sortOptions?: any
  ): Promise<{
    data: Array<{ adName: string; adSetName: string; total: number; estimateSet: number; percentage: string; jobBookedAmount: number; proposalAmount: number }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      pageSize: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const { totalCount, data } = await this.aggregationRepo.getAdNamePerformance(
      query, 
      page, 
      limit, 
      sortOptions
    );

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
  private getEmptyAnalyticsResult(): AnalyticsResult {
    return {
      overview: { totalLeads: 0, estimateSetCount: 0, unqualifiedCount: 0, estimateSetRate: '0.0', estimateSetPercent: '0.0' },
      zipData: [],
      serviceData: [],
      dayOfWeekData: [],
      ulrData: []
    };
  }
}
