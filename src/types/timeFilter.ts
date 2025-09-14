/**
 * Shared time filter types
 * Used across both backend and frontend to ensure consistency
 */
export type TimeFilter = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year';

export const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  all: 'All Time',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  last_quarter: 'Last Quarter',
  this_year: 'This Year',
  last_year: 'Last Year',
};

export default TimeFilter;
