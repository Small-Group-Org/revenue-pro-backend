import { TimezoneUtils } from "../../../utils/timezoneUtils.js";
import { ANALYTICS } from "./config.js";

/**
 * Analytics Utility Functions
 * Helper functions specifically for analytics processing
 */

// Types for analytics utilities
interface DayData {
  day: string;
  total: number;
  estimateSet: number;
  percentage: string;
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
  dayOfWeekData: Array<DayData>;
  ulrData: Array<{ reason: string; count: number; percentage: string }>;
}

/**
 * Create timezone-aware date range query
 */
export function createDateRangeQuery(startDate?: string, endDate?: string): any {
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

/**
 * Format percentage to fixed decimal places
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

/**
 * Calculate conversion rate percentage
 */
export function calculateConversionRate(total: number, converted: number): string {
  if (total === 0) return '0.0';
  return ((converted / total) * 100).toFixed(1);
}

/**
 * Sort day data by day of week order
 */
export function sortByDay(dayData: DayData[]): DayData[] {
  return dayData.sort((a, b) => {
    return ANALYTICS.DAY_ORDER.indexOf(a.day as any) - ANALYTICS.DAY_ORDER.indexOf(b.day as any);
  });
}

/**
 * Sort date data chronologically
 */
export function sortByDate(dateData: Array<{ date: string; count: number; percentage: string }>): Array<{ date: string; count: number; percentage: string }> {
  return dateData.sort((a, b) => 
    new Date(a.date + ', 2024').getTime() - new Date(b.date + ', 2024').getTime()
  );
}

/**
 * Sort data by count in descending order
 */
export function sortByCount<T extends { count: number }>(data: T[]): T[] {
  return data.sort((a, b) => b.count - a.count);
}

/**
 * Get empty analytics result structure
 */
export function getEmptyAnalyticsResult(): AnalyticsResult {
  return {
    overview: { 
      totalLeads: 0, 
      estimateSetCount: 0, 
      unqualifiedCount: 0, 
      conversionRate: '0.0' 
    },
    zipData: [],
    serviceData: [],
    leadDateData: [],
    dayOfWeekData: [],
    ulrData: []
  };
}

/**
 * Create pagination info object
 */
export function createPaginationInfo(
  currentPage: number, 
  totalCount: number, 
  pageSize: number
): {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  
  return {
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1
  };
}

/**
 * Process data for analytics display
 */
export function processAnalyticsData<T extends Record<string, any>>(
  data: T[],
  countField: string,
  totalCount: number,
  sortByCount: boolean = true
): Array<T & { percentage: string }> {
  const processedData = data.map(item => ({
    ...item,
    percentage: calculateConversionRate(totalCount, item[countField])
  }));

  if (sortByCount) {
    return processedData.sort((a, b) => b[countField] - a[countField]);
  }
  
  return processedData;
}

/**
 * Validate time filter value
 */
export function isValidTimeFilter(filter: string): boolean {
  return ANALYTICS.TIME_FILTERS.includes(filter as any);
}

/**
 * Get default pagination options
 */
export function getDefaultPaginationOptions() {
  return {
    page: 1,
    limit: ANALYTICS.DEFAULT_PAGE_SIZE,
    sortBy: 'date' as const,
    sortOrder: 'desc' as const
  };
}

/**
 * Calculate skip value for pagination
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(page: number, limit: number): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (page < 1) {
    errors.push('Page must be greater than 0');
  }
  
  if (limit < 1) {
    errors.push('Limit must be greater than 0');
  }
  
  if (limit > 1000) {
    errors.push('Limit cannot exceed 1000');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
