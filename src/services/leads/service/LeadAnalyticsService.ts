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
    conversionRate: string;
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
    timeFilter: TimeFilterOptions['timeFilter'] = 'all'
  ): Promise<AnalyticsResult> {
    // Build time filter query
    const query: any = { clientId };
    const now = new Date();
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

    switch (timeFilter) {
      case 'this_month': {
        const startDate = fmt(startOfMonth(now));
        const endDate = fmt(endOfMonth(now));
        const dateRangeQuery = TimezoneUtils.createDateRangeQuery(startDate, endDate);
        query.leadDate = dateRangeQuery.leadDate;
        break;
      }

      case 'last_month': {
        const lastMonth = subMonths(now, 1);
        const startDate = fmt(startOfMonth(lastMonth));
        const endDate = fmt(endOfMonth(lastMonth));
        const dateRangeQuery = TimezoneUtils.createDateRangeQuery(startDate, endDate);
        query.leadDate = dateRangeQuery.leadDate;
        break;
      }

      case 'this_quarter': {
        const startDate = fmt(startOfQuarter(now));
        const endDate = fmt(endOfQuarter(now));
        const dateRangeQuery = TimezoneUtils.createDateRangeQuery(startDate, endDate);
        query.leadDate = dateRangeQuery.leadDate;
        break;
      }

      case 'last_quarter': {
        const lastQuarter = subQuarters(now, 1);
        const startDate = fmt(startOfQuarter(lastQuarter));
        const endDate = fmt(endOfQuarter(lastQuarter));
        const dateRangeQuery = TimezoneUtils.createDateRangeQuery(startDate, endDate);
        query.leadDate = dateRangeQuery.leadDate;
        break;
      }

      case 'this_year': {
        const startDate = fmt(startOfYear(now));
        const endDate = fmt(endOfYear(now));
        const dateRangeQuery = TimezoneUtils.createDateRangeQuery(startDate, endDate);
        query.leadDate = dateRangeQuery.leadDate;
        break;
      }

      case 'last_year': {
        const lastYear = subYears(now, 1);
        const startDate = fmt(startOfYear(lastYear));
        const endDate = fmt(endOfYear(lastYear));
        const dateRangeQuery = TimezoneUtils.createDateRangeQuery(startDate, endDate);
        query.leadDate = dateRangeQuery.leadDate;
        break;
      }
    }

    console.log("Analytics query", query);

    // Fetch filtered leads
    const leads = await this.leadRepo.findLeads(query);
    console.log("Analytics leads count", leads.length);

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
    commonTimeFilter: 'all' | '7' | '14' | '30' | '60' = 'all',
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
    // Build time filter query
    const query: any = { clientId };
    
    if (commonTimeFilter !== 'all') {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(commonTimeFilter));
      query.leadDate = { $gte: daysAgo.toISOString().split('T')[0] };
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
    const estimateSetLeads = leads.filter(lead => lead.status === 'estimate_set');
    const estimateSetCount = estimateSetLeads.length;
    const unqualifiedLeads = leads.filter(lead => lead.status === 'unqualified');
    const unqualifiedCount = unqualifiedLeads.length;
    const conversionRate = ((estimateSetCount / totalLeads) * 100).toFixed(1);

    // Process each analytics section in parallel
    const [zipData, serviceData, leadDateData, dayOfWeekData, ulrData] = await Promise.all([
      this.processZipAnalysis(estimateSetLeads, estimateSetCount),
      this.processServiceAnalysis(estimateSetLeads, estimateSetCount),
      this.processLeadDateAnalysis(estimateSetLeads, estimateSetCount),
      this.processDayOfWeekAnalysis(leads),
      this.processUnqualifiedReasonsAnalysis(unqualifiedLeads, unqualifiedCount)
    ]);

    return {
      overview: { totalLeads, estimateSetCount, unqualifiedCount, conversionRate },
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
  private async processZipAnalysis(estimateSetLeads: any[], estimateSetCount: number) {
    const zipAnalysis = estimateSetLeads.reduce((acc, lead) => {
      if (lead.zip) acc[lead.zip] = (acc[lead.zip] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(zipAnalysis)
      .map(([zip, count]: [string, any]) => ({
        zip,
        count,
        percentage: ((count / estimateSetCount) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Process service analysis
   */
  private async processServiceAnalysis(estimateSetLeads: any[], estimateSetCount: number) {
    const serviceAnalysis = estimateSetLeads.reduce((acc, lead) => {
      acc[lead.service] = (acc[lead.service] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(serviceAnalysis)
      .map(([service, count]: [string, any]) => ({
        service,
        count,
        percentage: ((count / estimateSetCount) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Process day of week analysis
   */
  private async processDayOfWeekAnalysis(leads: any[]) {
    const dayOfWeekAnalysis = leads.reduce((acc, lead) => {
      // Convert UTC ISO string to CST for day of week calculation
      const cstDate = TimezoneUtils.convertUTCStringToCST(lead.leadDate);
      const dayOfWeek = cstDate.toLocaleDateString('en-US', { weekday: 'long' });
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
  private async processLeadDateAnalysis(estimateSetLeads: any[], estimateSetCount: number) {
    const leadDateAnalysis = estimateSetLeads.reduce((acc, lead) => {
      // Convert UTC ISO string to CST for date analysis
      const cstDate = TimezoneUtils.convertUTCStringToCST(lead.leadDate);
      const date = cstDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(leadDateAnalysis)
      .map(([date, count]: [string, any]) => ({
        date,
        count,
        percentage: ((count / estimateSetCount) * 100).toFixed(1)
      }))
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
      overview: { totalLeads: 0, estimateSetCount: 0, unqualifiedCount: 0, conversionRate: '0.0' },
      zipData: [],
      serviceData: [],
      leadDateData: [],
      dayOfWeekData: [],
      ulrData: []
    };
  }
}
