import { ILead } from "../domain/leads.domain.js";
import { ILeadRepository, ILeadAggregationRepository } from "../repository/interfaces.js";
import { leadRepository } from "../repository/LeadRepository.js";
import { leadAggregationRepository } from "../repository/LeadAggregationRepository.js";
import { TimezoneUtils } from "../../../utils/timezoneUtils.js";
import { TimeFilter } from "../../../types/timeFilter.js";
import { ANALYTICS } from "../utils/config.js";
import { 
  startOfMonth, endOfMonth, 
  startOfQuarter, endOfQuarter, 
  startOfYear, endOfYear, 
  subMonths, subQuarters, subYears, format
} from 'date-fns';

// Types for analytics
interface TimeFilterOptions {
  timeFilter: TimeFilter;
}

interface AnalyticsResult {
  overview: {
    totalLeads: number;
    estimateSetCount: number;
    unqualifiedCount: number;
    estimateSetRate: string;
  };
  zipData: Array<{ zip: string; count: number; percentage: string }>;
  serviceData: Array<{ service: string; count: number; percentage: string }>;
  leadDateData: Array<{ date: string; count: number; percentage: string }>;
  dayOfWeekData: Array<{ day: string; total: number; estimateSet: number; percentage: string }>;
  ulrData: Array<{ reason: string; count: number; percentage: string }>;
}

interface PaginatedPerformanceResult {
  adSetData: {
    data: Array<{ adSetName: string; total: number; estimateSet: number; percentage: string }>;
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
    data: Array<{ adName: string; adSetName: string; total: number; estimateSet: number; percentage: string }>;
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
    endDate?: string
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
    const analytics = await this.processLeadAnalytics(leads);
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
      adSetSortField?: 'adSetName' | 'total' | 'estimateSet' | 'percentage';
      adSetSortOrder?: 'asc' | 'desc';
      adNameSortField?: 'adName' | 'total' | 'estimateSet' | 'percentage';
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
  private async processLeadAnalytics(leads: any[]): Promise<AnalyticsResult> {
    const totalLeads = leads.length;
    const estimateSetCount = leads.filter(lead => lead.status === 'estimate_set').length;
    const unqualifiedCount = leads.filter(lead => lead.status === 'unqualified').length;
    let estimateSetRate = ((estimateSetCount / (unqualifiedCount + estimateSetCount)) * 100).toFixed(1);
    if (isNaN(Number(estimateSetRate))) {
      estimateSetRate = '0.0';
    }

    // Process each analytics section in parallel
    const [zipData, serviceData, leadDateData, dayOfWeekData, ulrData] = await Promise.all([
      this.processZipAnalysis(leads),
      this.processServiceAnalysis(leads),
      this.processLeadDateAnalysis(leads),
      this.processDayOfWeekAnalysis(leads),
      this.processUnqualifiedReasonsAnalysis(
        leads.filter(lead => lead.status === 'unqualified'),
        unqualifiedCount
      )
    ]);

    return {
      overview: { totalLeads, estimateSetCount, unqualifiedCount, estimateSetRate },
      zipData,
      serviceData,
      leadDateData,
      dayOfWeekData,
      ulrData
    };
  }

  /**
   * Process ZIP code analysis
   */
  private async processZipAnalysis(leads: any[]) {
    // Group by zip
    const zipGroups: Record<string, { estimateSet: number; unqualified: number }> = {};
    for (const lead of leads) {
      if (!lead.zip) continue;
      if (!zipGroups[lead.zip]) zipGroups[lead.zip] = { estimateSet: 0, unqualified: 0 };
      if (lead.status === 'estimate_set') zipGroups[lead.zip].estimateSet += 1;
      if (lead.status === 'unqualified') zipGroups[lead.zip].unqualified += 1;
    }
    return Object.entries(zipGroups)
      .map(([zip, { estimateSet, unqualified }]) => {
        const denominator = estimateSet + unqualified;
        return {
          zip,
          count: estimateSet,
          percentage: denominator > 0 ? ((estimateSet / denominator) * 100).toFixed(1) : '0.0'
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Process service analysis
   */
  private async processServiceAnalysis(leads: any[]) {
    const serviceGroups: Record<string, { estimateSet: number; unqualified: number }> = {};
    for (const lead of leads) {
      if (!lead.service) continue;
      if (!serviceGroups[lead.service]) serviceGroups[lead.service] = { estimateSet: 0, unqualified: 0 };
      if (lead.status === 'estimate_set') serviceGroups[lead.service].estimateSet += 1;
      if (lead.status === 'unqualified') serviceGroups[lead.service].unqualified += 1;
    }
    return Object.entries(serviceGroups)
      .map(([service, { estimateSet, unqualified }]) => {
        const denominator = estimateSet + unqualified;
        return {
          service,
          count: estimateSet,
          percentage: denominator > 0 ? ((estimateSet / denominator) * 100).toFixed(1) : '0.0'
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Process day of week analysis
   */
  private async processDayOfWeekAnalysis(leads: any[]) {
    const dayOfWeekAnalysis = leads.reduce((acc, lead) => {
      // Use stored timestamp as-is for day of week calculation
      const dt = new Date(lead.leadDate);
      const dayOfWeek = dt.toLocaleDateString('en-US', { weekday: 'long' });
      if (!acc[dayOfWeek]) {
        acc[dayOfWeek] = { total: 0, estimateSet: 0 };
      }
      acc[dayOfWeek].total += 1;
      if (lead.status === 'estimate_set') {
        acc[dayOfWeek].estimateSet += 1;
      }
      return acc;
    }, {});

    return Object.entries(dayOfWeekAnalysis)
      .map(([day, data]: [string, any]) => ({
        day,
        total: data.total,
        estimateSet: data.estimateSet,
        percentage: data.total > 0 ? ((data.estimateSet / data.total) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => {
        return ANALYTICS.DAY_ORDER.indexOf(a.day as any) - ANALYTICS.DAY_ORDER.indexOf(b.day as any);
      });
  }

  /**
   * Process lead date analysis
   */
  private async processLeadDateAnalysis(leads: any[]) {
    const dateGroups: Record<string, { estimateSet: number; unqualified: number }> = {};
    for (const lead of leads) {
      const dt = new Date(lead.leadDate);
      const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dateGroups[date]) dateGroups[date] = { estimateSet: 0, unqualified: 0 };
      if (lead.status === 'estimate_set') dateGroups[date].estimateSet += 1;
      if (lead.status === 'unqualified') dateGroups[date].unqualified += 1;
    }
    return Object.entries(dateGroups)
      .map(([date, { estimateSet, unqualified }]) => {
        const denominator = estimateSet + unqualified;
        return {
          date,
          count: estimateSet,
          percentage: denominator > 0 ? ((estimateSet / denominator) * 100).toFixed(1) : '0.0'
        };
      })
      .sort((a, b) => new Date(a.date + ', 2024').getTime() - new Date(b.date + ', 2024').getTime());
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
        count,
        percentage: unqualifiedCount > 0 ? ((count / unqualifiedCount) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.count - a.count);
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
    data: Array<{ adSetName: string; total: number; estimateSet: number; percentage: string }>;
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
        percentage: item.percentage.toFixed(1)
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
    data: Array<{ adName: string; adSetName: string; total: number; estimateSet: number; percentage: string }>;
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
        percentage: item.percentage.toFixed(1)
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
      overview: { totalLeads: 0, estimateSetCount: 0, unqualifiedCount: 0, estimateSetRate: '0.0' },
      zipData: [],
      serviceData: [],
      leadDateData: [],
      dayOfWeekData: [],
      ulrData: []
    };
  }
}
