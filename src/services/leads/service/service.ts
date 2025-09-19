import { ILead, ILeadDocument } from "../domain/leads.domain.js";
import LeadModel from "../repository/models/leads.model.js";
import { conversionRateRepository } from "../repository/repository.js";
import { TimezoneUtils } from "../../../utils/timezoneUtils.js";
import { TimeFilter } from "../../../types/timeFilter.js";
import {
  FIELD_WEIGHTS,
  getMonthlyName,
  createConversionRatesMap,
  getConversionRateFromMap,
  calculateLeadScore,
  getMonthIndex,
  isEmptyValue,
  type LeadKeyField,
  type UniqueKey,
  getDateConversionRateFromMap
} from "../utils/leads.util.js";
import mongoose, { PipelineStage } from "mongoose";
import { 
  startOfMonth, endOfMonth, 
  startOfQuarter, endOfQuarter, 
  startOfYear, endOfYear, 
  subMonths, subQuarters, subYears, format
}  from 'date-fns';
import User from "../../user/repository/models/user.model.js";

// Types moved to leads.util.ts and sheets.service.ts for better organization

// Re-export SheetProcessingResult from sheets service for backward compatibility
export type { SheetProcessingResult } from "./sheets.service.js";
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
  }

  interface PaginatedLeadsResult {
    leads: ILeadDocument[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      pageSize: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }
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

export class LeadService {

  /**
   * Update conversion rates and lead scores for all leads of a client.
   * - Calculates conversion rates for all 5 fields (service, adSetName, adName, leadDate, zip)
   * - Upserts conversion rates to DB
   * - Recalculates lead scores for all leads
   * - Stores conversion rates for each lead in a new field 'conversionRates'
   *
   * @param clientId - The client ID to process
   * @returns Summary of update operation
   */
// Refactored updateConversionRatesAndLeadScoresForClient method
public async updateConversionRatesAndLeadScoresForClient(clientId: string): Promise<{
  updatedConversionRates: number;
  updatedLeads: number;
  totalProcessedLeads: number;
  errors: string[];
  conversionRateStats?: {
    newInserts: number;
    updated: number;
  };
}> {
  const errors: string[] = [];
  try {
    console.log(`[CR Update] Starting update for clientId: ${clientId}`);
    
    // 1. Fetch all leads for client
    const leads = await LeadModel.find({ clientId }).lean().exec();
    if (leads.length === 0) {
      console.log(`[CR Update] No leads found for clientId: ${clientId}`);
      return { updatedConversionRates: 0, updatedLeads: 0, totalProcessedLeads: 0, errors: [] };
    }

    // 2. Calculate conversion rates for all unique fields
    const conversionData = this.processLeads(leads, clientId);
    console.log(`[CR Update] Calculated ${conversionData.length} conversion rates for clientId: ${clientId}`);

    // 3. Upsert conversion rates to DB
    const crUpsertResult = await conversionRateRepository.batchUpsertConversionRates(conversionData);
    console.log(`[CR Update] Upserted conversion rates to DB for clientId: ${clientId} - New: ${crUpsertResult.stats.newInserts}, Updated: ${crUpsertResult.stats.updated}`);

    // 4. Fetch conversion rates from DB for this client
    const dbConversionRates = await conversionRateRepository.getConversionRates({ clientId });
    const conversionRatesMap = createConversionRatesMap(dbConversionRates);
    
    // 5. Build bulk operations using helper function
    const { bulkOps, actuallyUpdatedLeads } = this.buildLeadUpdateBulkOps(leads, conversionRatesMap);

    // 6. Bulk update only changed leads
    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await LeadModel.bulkWrite(bulkOps);
      modifiedCount = result.modifiedCount;
      console.log(`[CR Update] Updated ${modifiedCount} leads with new scores and conversionRates for clientId: ${clientId}`);
    } else {
      console.log(`[CR Update] No leads needed updating for clientId: ${clientId}`);
    }

    return {
      updatedConversionRates: crUpsertResult.stats.total,
      updatedLeads: actuallyUpdatedLeads,
      totalProcessedLeads: leads.length,
      errors,
      conversionRateStats: {
        newInserts: crUpsertResult.stats.newInserts,
        updated: crUpsertResult.stats.updated
      }
    };
  } catch (error: any) {
    const errorMsg = `[CR Update] Error updating conversion rates and lead scores for clientId ${clientId}: ${error.message}`;
    console.error(errorMsg);
    errors.push(errorMsg);
    return {
      updatedConversionRates: 0,
      updatedLeads: 0,
      totalProcessedLeads: 0,
      errors
    };
  }
}

   public async getLeadAnalytics(
  clientId: string,
  timeFilter: TimeFilterOptions['timeFilter'] = 'all'
): Promise<AnalyticsResult> {
  // Build time filter query
  const query: any = { clientId };
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

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

  console.log("query", query);

  // Fetch filtered leads
  const leads = await LeadModel.find(query).lean().exec();

  console.log("leads", leads);
  

  if (leads.length === 0) {
    return this.getEmptyAnalyticsResult();
  }

  // Process analytics using aggregation pipelines for better performance
  const analytics = await this.processLeadAnalytics(leads);
  return analytics;
}

// Step 1: Check if user exists
public async doesUserExist(clientId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    return false; // Prevents CastError for invalid ObjectId strings
  }
  return (await User.exists({ _id: clientId })) !== null;
}

// Step 2: Check if user has any leads in Lead collection
public async hasLeadData(clientId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    return false; // Invalid clientId can't have leads
  }
  return (await LeadModel.exists({ clientId })) !== null;
}

public async getPerformanceTables(
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

// Helper function to calculate conversion rates and lead score for a single lead
private calculateLeadConversionRatesAndScore(lead: any, conversionRatesMap: any): {
  conversionRates: {
    service: number;
    adSetName: number;
    adName: number;
    leadDate: number;
    zip: number;
  };
  leadScore: number;
} {
  // Get conversion rates for each field from DB using efficient Map lookups
  const serviceRate = getConversionRateFromMap(conversionRatesMap, 'service', lead.service || '');
  const adSetNameRate = getConversionRateFromMap(conversionRatesMap, 'adSetName', lead.adSetName || '');
  const adNameRate = getConversionRateFromMap(conversionRatesMap, 'adName', lead.adName || '');
  
  // leadDate is now a UTC ISO string, convert to CST for month extraction
  const cstDate = TimezoneUtils.convertUTCStringToCST(lead.leadDate);
  const monthName = cstDate.toLocaleString("en-US", { month: "long" });
  const leadDateRate = getConversionRateFromMap(conversionRatesMap, 'leadDate', monthName);
  const zipRate = getConversionRateFromMap(conversionRatesMap, 'zip', lead.zip || '');

  // Build conversionRates object for this lead
  const conversionRates = {
    service: serviceRate,
    adSetName: adSetNameRate,
    adName: adNameRate,
    leadDate: leadDateRate,
    zip: zipRate
  };

  // Calculate leadScore using all fields
  const weightedScore =
    (serviceRate * FIELD_WEIGHTS.service) +
    (adSetNameRate * FIELD_WEIGHTS.adSetName) +
    (adNameRate * FIELD_WEIGHTS.adName) +
    (leadDateRate * FIELD_WEIGHTS.leadDate) +
    (zipRate * FIELD_WEIGHTS.zip);
  
  const leadScore = Math.round(Math.max(0, Math.min(100, weightedScore)));

  return { conversionRates, leadScore };
}

// Helper function to build bulk operations for lead updates
private buildLeadUpdateBulkOps(leads: any[], conversionRatesMap: any): {
  bulkOps: any[];
  actuallyUpdatedLeads: number;
} {
  const bulkOps = [];
  let actuallyUpdatedLeads = 0;

  for (const lead of leads) {
    const { conversionRates, leadScore } = this.calculateLeadConversionRatesAndScore(lead, conversionRatesMap);
    // Only update if leadScore or conversionRates have changed
    const leadScoreChanged = lead.leadScore !== leadScore;
    const conversionRatesChanged = JSON.stringify(lead.conversionRates ?? {}) !== JSON.stringify(conversionRates);
    
    if (leadScoreChanged || conversionRatesChanged) {
      bulkOps.push({
        updateOne: {
          filter: { _id: lead._id },
          update: {
            $set: {
              leadScore,
              conversionRates
            }
          }
        }
      });
      actuallyUpdatedLeads++;
    }
  }

  return { bulkOps, actuallyUpdatedLeads };
}

public async upsertLead(query: Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">, payload: Partial<ILeadDocument>) {
  const existingLead = await LeadModel.findOne(query).lean().exec();
  
  if (existingLead) {
    const updatePayload = { ...payload };
    updatePayload.leadScore = existingLead.leadScore;
    updatePayload.conversionRates = existingLead.conversionRates;
    
    return await LeadModel.findOneAndUpdate(
      query,
      { $set: updatePayload },
      { new: true }
    );
  } else {
    if (!payload.clientId || !payload.service || !payload.adSetName || !payload.adName || (!payload.phone && !payload.email)) {
      throw new Error('Missing required fields: clientId, service, adSetName, adName, and at least phone or email');
    }
    
    const newLeadPayload = { ...payload };
    const conversionRates = await conversionRateRepository.getConversionRates({ clientId: payload.clientId });
    if (conversionRates.length > 0) {
  const conversionRatesMap = createConversionRatesMap(conversionRates);

  // Build conversionRates using the same helpers as calculateLeadScore
  newLeadPayload.conversionRates = {
    service: getConversionRateFromMap(conversionRatesMap, "service", payload.service),
    adSetName: getConversionRateFromMap(conversionRatesMap, "adSetName", payload.adSetName),
    adName: getConversionRateFromMap(conversionRatesMap, "adName", payload.adName),
    leadDate: getDateConversionRateFromMap(conversionRatesMap, payload.leadDate || ""),
    zip: getConversionRateFromMap(conversionRatesMap, "zip", payload.zip || ""),
  };

  // Lead score still comes from your existing function
  newLeadPayload.leadScore = calculateLeadScore(
    {
      service: payload.service || "",
      adSetName: payload.adSetName || "",
      adName: payload.adName || "",
      leadDate: payload.leadDate || "",
      zip: payload.zip || "",
    },
    conversionRatesMap
  );
} else {
  newLeadPayload.leadScore = 0;
  newLeadPayload.conversionRates = {};
}



    // New leads now include both lead scores and conversion rates
    return await LeadModel.findOneAndUpdate(
      query,
      { $set: newLeadPayload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );
  }
}

/**
 * Private methods updated to return pagination structure
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
  const pipeline: PipelineStage[] = [
    { $match: query },
    {
      $group: {
        _id: '$adSetName',
        total: { $sum: 1 },
        estimateSet: {
          $sum: { $cond: [{ $eq: ['$status', 'estimate_set'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        adSetName: '$_id',
        total: 1,
        estimateSet: 1,
        percentage: {
          $multiply: [
            { $divide: ['$estimateSet', '$total'] },
            100
          ]
        },
        _id: 0
      }
    }
  ];

  // Add sorting
  if (sortOptions?.showTopRanked) {
    pipeline.push({ $sort: { percentage: -1, estimateSet: -1 } });
  } else if (sortOptions?.adSetSortField) {
    const sortField = sortOptions.adSetSortField === 'percentage'
      ? 'percentage'
      : sortOptions.adSetSortField;

    const sortOrder: 1 | -1 = sortOptions.adSetSortOrder === 'asc' ? 1 : -1;
    pipeline.push({ $sort: { [sortField]: sortOrder } as Record<string, 1 | -1> });
  }

  // Get total count for pagination
  const totalResults = await LeadModel.aggregate([...pipeline, { $count: 'total' }]);
  const totalCount = totalResults[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Add pagination
  pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });

  const data = await LeadModel.aggregate(pipeline);

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
  const pipeline: PipelineStage[] = [
    { $match: query },
    {
      $group: {
        _id: { adName: '$adName', adSetName: '$adSetName' },
        total: { $sum: 1 },
        estimateSet: {
          $sum: { $cond: [{ $eq: ['$status', 'estimate_set'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        adName: '$_id.adName',
        adSetName: '$_id.adSetName',
        total: 1,
        estimateSet: 1,
        percentage: {
          $multiply: [
            { $divide: ['$estimateSet', '$total'] },
            100
          ]
        },
        _id: 0
      }
    }
  ];

  // Add sorting (similar to adSet)
  if (sortOptions?.showTopRanked) {
    pipeline.push({ $sort: { percentage: -1, estimateSet: -1 } });
  } else if (sortOptions?.adNameSortField) {
    const sortField = sortOptions.adNameSortField === 'percentage' ? 'percentage' : sortOptions.adNameSortField;
    const sortOrder = sortOptions.adNameSortOrder === 'asc' ? 1 : -1;
    pipeline.push({ $sort: { [sortField]: sortOrder } });
  }

  // Get total count for pagination
  const totalResults = await LeadModel.aggregate([...pipeline, { $count: 'total' }]);
  const totalCount = totalResults[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Add pagination
  pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });

  const data = await LeadModel.aggregate(pipeline);

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
 * Private method to process lead analytics using aggregation
 */
private async processLeadAnalytics(leads: any[]): Promise<AnalyticsResult> {
  const totalLeads = leads.length;
  const estimateSetLeads = leads.filter(lead => lead.status === 'estimate_set');
  const estimateSetCount = estimateSetLeads.length;
  const unqualifiedLeads = leads.filter(lead => lead.status === 'unqualified');
  const unqualifiedCount = unqualifiedLeads.length;
  const conversionRate = ((estimateSetCount / totalLeads) * 100).toFixed(1);

  // Process each analytics section
  const [zipData, serviceData,  leadDateData, dayOfWeekData, ulrData] = await Promise.all([
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
 * Private helper methods for each analytics section
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
      const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    });
}


private createDateRangeQuery(startDate?: string, endDate?: string): any {
  if (!startDate && !endDate) return {};
  
  if (startDate && endDate) {
    const dateRange = TimezoneUtils.createDateRangeQuery(startDate, endDate);
    return dateRange.leadDate;
  } else if (startDate) {
    const dateRange = TimezoneUtils.createDateRangeQuery(startDate, startDate);
    return { $gte: dateRange.leadDate.$gte };
  } else if (endDate) {
    const dateRange = TimezoneUtils.createDateRangeQuery(endDate, endDate);
    return { $lte: dateRange.leadDate.$lte };
  }
  
  return {};
}

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
  // Paginated, sortable, filterable leads fetch
  public async getLeadsPaginated(
  clientId?: string,
  startDate?: string,
  endDate?: string,
  pagination: PaginationOptions = { page: 1, limit: 50, sortBy: 'date', sortOrder: 'desc' },
  filters: FilterOptions = {}
): Promise<PaginatedLeadsResult> {
  const query: any = {};

  // client filter
  if (clientId) query.clientId = clientId;

  // date filter -> use timezone-aware date range query
  if (startDate || endDate) {
    query.leadDate = this.createDateRangeQuery(startDate, endDate);
  }

  // filters
  if (filters.service) query.service = filters.service;
  if (filters.adSetName) query.adSetName = { $regex: filters.adSetName, $options: 'i' };
  if (filters.adName) query.adName = { $regex: filters.adName, $options: 'i' };
  if (filters.status) query.status = filters.status;
  if (filters.unqualifiedLeadReason) {
    query.status = 'unqualified';
    query.unqualifiedLeadReason = { $regex: filters.unqualifiedLeadReason, $options: 'i' };
  }

  // pagination setup
  const skip = (pagination.page - 1) * pagination.limit;
  const sortField = pagination.sortBy === 'score' ? 'leadScore' : 'leadDate';
  const sortOrder = pagination.sortOrder === 'desc' ? -1 : 1;

  // run count + leads query in parallel
  const [totalCount, leads] = await Promise.all([
    LeadModel.countDocuments(query),
    LeadModel.find(query)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(pagination.limit)
      .lean()
      .exec()
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pagination.limit));

  return {
    leads,
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


  // Filter options for dropdowns
  // Filter options for dropdowns + status counts
public async fetchLeadFiltersAndCounts(
  clientId?: string,
  startDate?: string,
  endDate?: string
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
}>
 {
  const query: any = {};
  if (clientId) query.clientId = clientId;

  if (startDate || endDate) {
    query.leadDate = this.createDateRangeQuery(startDate, endDate);
  }

  // run distinct queries in parallel
  const [services, adSetNames, adNames, statuses, unqualifiedLeadReasons, statusAgg] =
    await Promise.all([
      LeadModel.distinct("service", query),
      LeadModel.distinct("adSetName", query),
      LeadModel.distinct("adName", query),
      LeadModel.distinct("status", query),
      LeadModel.distinct("unqualifiedLeadReason", { ...query, status: "unqualified" }),
      // aggregation for status counts
      LeadModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ])
    ]);

  // normalize status counts
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

  /**
   * Calculate and store lead scores for leads that don't have them
   */
  private async calculateAndStoreMissingLeadScores(
    leads: ILeadDocument[], 
    clientId: string
  ): Promise<ILeadDocument[]> {
    // Find leads without lead scores
    const leadsWithoutScores = leads.filter(lead => 
      typeof lead.leadScore === 'undefined' || lead.leadScore === null
    );

    if (leadsWithoutScores.length === 0) {
      console.log(`All leads already have lead scores for client ${clientId}`);
      return leads;
    }

    console.log(`Calculating lead scores for ${leadsWithoutScores.length} leads for client ${clientId}`);

    try {
      // Get conversion rates for this client
      const conversionRates = await conversionRateRepository.getConversionRates({ clientId });
      
      if (conversionRates.length === 0) {
        console.log(`No conversion rates found for client ${clientId}, setting lead scores to 0`);
        
        // Set all scores to 0 if no conversion rates exist
        const bulkOps = leadsWithoutScores.map(lead => ({
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: { leadScore: 0 } }
          }
        }));

        await LeadModel.bulkWrite(bulkOps);
        
        // Update the leads array with score 0
        leads.forEach(lead => {
          if (leadsWithoutScores.some(l => (l._id as any).toString() === (lead._id as any).toString())) {
            lead.leadScore = 0;
          }
        });
        
        return leads;
      }

      // Create conversion rates map for efficient lookups
      const conversionRatesMap = createConversionRatesMap(conversionRates);

      // Calculate scores for leads without them
      const bulkOps = leadsWithoutScores.map(lead => {
        const leadScore = calculateLeadScore(lead, conversionRatesMap);
        return {
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: { leadScore } }
          }
        };
      });

      // Bulk update lead scores in database
      await LeadModel.bulkWrite(bulkOps);
      console.log(`Updated lead scores for ${bulkOps.length} leads`);

      // Update the leads array with calculated scores
      leads.forEach(lead => {
        const leadWithoutScore = leadsWithoutScores.find(l => 
          (l._id as any).toString() === (lead._id as any).toString()
        );
        if (leadWithoutScore) {
          lead.leadScore = calculateLeadScore(lead, conversionRatesMap);
        }
      });

      return leads;
    } catch (error: any) {
      console.error(`Error calculating lead scores for client ${clientId}:`, error);
      // Return leads as-is if calculation fails
      return leads;
    }
  }

  /**
   * Recalculate ALL lead scores for a specific client (manual update function)
   */
public async recalculateAllLeadScores(clientId: string): Promise<{
  totalLeads: number;
  updatedLeads: number;
  errors: string[];
}> {
  const errors: string[] = [];
  
  try {
    console.log(`Starting lead score recalculation for client ${clientId}`);
    
    // Get all leads for this client
    const allLeads = await LeadModel.find({ clientId }).lean().exec();
    
    if (allLeads.length === 0) {
      return {
        totalLeads: 0,
        updatedLeads: 0,
        errors: [`No leads found for client ${clientId}`]
      };
    }

    // Get conversion rates for this client  
    const conversionRates = await conversionRateRepository.getConversionRates({ clientId });
    
    if (conversionRates.length === 0) {
      console.log(`No conversion rates found for client ${clientId}, setting all lead scores to 0`);
      
      await LeadModel.updateMany(
        { clientId },
        { 
          $set: { 
            leadScore: 0,
            conversionRates: {
              service: 0,
              adSetName: 0,
              adName: 0,
              leadDate: 0,
              zip: 0
            }
          } 
        }
      );
      
      return {
        totalLeads: allLeads.length,
        updatedLeads: allLeads.length,
        errors: []
      };
    }

    // Create conversion rates map for efficient lookups
    const conversionRatesMap = createConversionRatesMap(conversionRates);

    // Build bulk operations using helper function
    const { bulkOps, actuallyUpdatedLeads } = this.buildLeadUpdateBulkOps(allLeads, conversionRatesMap);

    // Bulk update only changed leads
    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await LeadModel.bulkWrite(bulkOps);
      modifiedCount = result.modifiedCount;
      console.log(`Recalculated scores and conversion rates for ${modifiedCount} leads for client ${clientId}`);
    } else {
      console.log(`No leads needed updating for client ${clientId}`);
    }

    return {
      totalLeads: allLeads.length,
      updatedLeads: actuallyUpdatedLeads,
      errors: []
    };
  } catch (error: any) {
    const errorMsg = `Error recalculating lead scores for client ${clientId}: ${error.message}`;
    console.error(errorMsg);
    errors.push(errorMsg);
    
    return {
      totalLeads: 0,
      updatedLeads: 0,
      errors
    };
  }
}


  // ---------------- UPDATED DATABASE OPERATIONS ----------------
  
  public async getLeads(
    clientId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ILeadDocument[]> {
    const query: any = {};
    if (clientId) query.clientId = clientId;
    if (startDate && endDate)
      query.leadDate = { $gte: startDate, $lte: endDate };
    else if (startDate) query.leadDate = { $gte: startDate };
    else if (endDate) query.leadDate = { $lte: endDate };

    // Get leads with optimized query
    const leads = await LeadModel.find(query)
      .sort({ leadDate: 1, _id: 1 })
      .lean()
      .exec();

    // Calculate and store missing lead scores automatically
    if (clientId) {
      return await this.calculateAndStoreMissingLeadScores(leads as ILeadDocument[], clientId);
    }
    
    return leads as ILeadDocument[];
  }

  // ---------------- UPDATED PROCESSING FUNCTIONS ----------------
  
  private getUniqueFieldValues(leads: ILead[]): UniqueKey[] {
    // Use Maps for better performance with large datasets
    const serviceSet = new Set<string>();
    const adSetNameSet = new Set<string>();
    const adNameSet = new Set<string>();
    const monthSet = new Set<string>();
    const zipSet = new Set<string>(); // NEW: ZIP code set

    // Single pass through leads array for optimal performance
    // Data is already sanitized at entry points, so no need for extensive type checking
    for (const lead of leads) {
      if (!isEmptyValue(lead.service)) {
        serviceSet.add(lead.service);
      }
      
      if (!isEmptyValue(lead.adSetName)) {
        adSetNameSet.add(lead.adSetName);
      }
      
      if (!isEmptyValue(lead.adName)) {
        adNameSet.add(lead.adName);
      }
      
      if (!isEmptyValue(lead.zip || '')) {
        zipSet.add(lead.zip || '');
      }
      
      // Optimized month extraction
      if (lead.leadDate) {
        const monthName = getMonthlyName(lead.leadDate);
        if (monthName) monthSet.add(monthName);
      }
    }

    // Pre-allocate result array for better memory management
    const result: UniqueKey[] = [];
    
    // Convert sets to UniqueKey objects efficiently
    serviceSet.forEach(service => result.push({ value: service, field: "service" }));
    adSetNameSet.forEach(adSetName => result.push({ value: adSetName, field: "adSetName" }));
    adNameSet.forEach(adName => result.push({ value: adName, field: "adName" }));
    monthSet.forEach(month => result.push({ value: month, field: "leadDate" }));
    zipSet.forEach(zip => result.push({ value: zip, field: "zip" })); // NEW: Add ZIP field

    return result;
  }

  private calculateConversionRate(
    clientLeads: ILead[], // Already filtered by clientId
    keyName: string,
    keyField: LeadKeyField
  ) {
    let totalForKey = 0;
    let yesForKey = 0;

    if (keyField === "leadDate") {
      const monthIndex = getMonthIndex(keyName);
      if (monthIndex === undefined)
        throw new Error(`Invalid month name: ${keyName}`);

      // Single pass through leads for date filtering
      for (const lead of clientLeads) {
        const leadMonth = new Date(lead.leadDate).getMonth();
        if (leadMonth === monthIndex) {
          totalForKey++;
          if (lead.status === 'estimate_set') {
            yesForKey++;
          }
        }
      }
    } else if (keyField === "zip") {
      // Single pass through leads for ZIP filtering
      // Data is already sanitized, so direct comparison is safe
      for (const lead of clientLeads) {
        if (lead.zip === keyName) {
          totalForKey++;
          if (lead.status === 'estimate_set') {
            yesForKey++;
          }
        }
      }
    } else {
      // Single pass through leads for field filtering
      // Data is already sanitized, so direct comparison is safe
      for (const lead of clientLeads) {
        if (lead[keyField] === keyName) {
          totalForKey++;
          if (lead.status === 'estimate_set') {
            yesForKey++;
          }
        }
      }
    }

      // Conversion rate as decimal, rounded to 2 decimals
      const conversionRate = totalForKey === 0 ? 0 :
        Math.round((yesForKey / totalForKey) * 100) / 100;
      
    return {
      conversionRate,
      pastTotalCount: totalForKey,
      pastTotalEst: yesForKey,
    };
  }

  public processLeads(leads: ILead[], clientId: string) {
    const result: {
      clientId: string;
      keyName: string;
      keyField: LeadKeyField;
      conversionRate: number;
      pastTotalCount: number;
      pastTotalEst: number;
    }[] = [];

    // OPTIMIZATION: Filter leads by clientId once instead of in each calculation
    const clientLeads = leads.filter((lead) => lead.clientId === clientId);
    
    if (clientLeads.length === 0) {
      return result; // Early return if no leads for this client
    }

    const allKeys = this.getUniqueFieldValues(clientLeads); // Use filtered leads

    for (const { value: keyName, field: keyField } of allKeys) {
      const { conversionRate, pastTotalCount, pastTotalEst } =
        this.calculateConversionRate(clientLeads, keyName, keyField);
      result.push({
        clientId,
        keyName,
        keyField,
        conversionRate,
        pastTotalCount,
        pastTotalEst,
      });
    }

    return result;
  }

  // ---------------- DATABASE OPERATIONS ----------------
  


  public async createLead(payload: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(payload);
  }

  // Bulk upsert leads with optional duplicate prevention based on email/phone uniqueness
  public async bulkCreateLeads(
    payloads: ILead[], 
    uniquenessByPhoneEmail: boolean = false
  ): Promise<{
    documents: ILeadDocument[];
    stats: {
      total: number;
      newInserts: number;
      duplicatesUpdated: number;
    };
  }> {
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
            { email: lead.email }, // Match by email
            { phone: lead.phone }  // Or match by phone
          ];
        } else if (hasEmail) {
          // Only email exists: match by email
          filter.email = lead.email;
        } else if (hasPhone) {
          // Only phone exists: match by phone
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
        upsert: true // Insert if not exists, update if exists
      }
      };
    });

    const result = await LeadModel.bulkWrite(bulkOps, { ordered: false });
    
    // Get statistics from bulkWrite result
    const newInserts = result.upsertedCount || 0;
    const duplicatesUpdated = result.modifiedCount || 0;
    const total = newInserts + duplicatesUpdated;
    
    // OPTIMIZATION: Only fetch documents if they're actually needed
    // Most callers only need the stats, not the full documents
    // If documents are needed, caller can fetch them separately with specific fields
    const documents: ILeadDocument[] = []; // Return empty array to avoid expensive query
    
    return {
      documents,
      stats: {
        total,
        newInserts,
        duplicatesUpdated
      }
    };
  }

  public async updateLead(
    id: string,
    data: Partial<Pick<ILead, "status" | "unqualifiedLeadReason">>
  ): Promise<ILeadDocument> {
    const existing = await LeadModel.findById(id);
    if (!existing) throw new Error("Lead not found");

    if (typeof data.status !== "undefined") {
      existing.status = data.status;
      // Clear unqualifiedLeadReason if status is not "unqualified"
      if (data.status !== 'unqualified') {
        existing.unqualifiedLeadReason = '';
      }
    }

    if (typeof data.unqualifiedLeadReason !== "undefined") {
      existing.unqualifiedLeadReason = data.unqualifiedLeadReason;
    }

    await existing.save();
    return existing;
  }

  public async deleteLeads(ids: string[]): Promise<{ deletedCount: number }> {
    const result = await LeadModel.updateMany(
      { _id: { $in: ids } },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    return { deletedCount: result.modifiedCount || 0 };
  }


  // ---------------- PROCESSING FUNCTIONS ----------------
  // Utility functions moved to leads.util.ts

  /**
   * Get all unique client IDs from leads collection
   */
  public async getAllClientIds(): Promise<string[]> {
    const clientIds = await LeadModel.distinct("clientId").exec();
    return clientIds.filter(id => id); // Remove any null/undefined values
  }

  /**
   * Get all leads for a specific client from database
   */
  public async getAllLeadsForClient(clientId: string): Promise<ILead[]> {
    const leads = await LeadModel.find({ clientId }).lean().exec();
    return leads as ILead[];
  }
}
