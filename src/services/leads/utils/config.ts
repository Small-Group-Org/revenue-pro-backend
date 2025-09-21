/**
 * Lead Service Configuration
 * Centralized configuration for all lead-related services
 */

// Field weights for lead scoring calculation
export const LEAD_CONFIG = {
  FIELD_WEIGHTS: {
    service: 30,
    adSetName: 10, 
    adName: 10,
    leadDate: 0,
    zip: 50
  } as const,
  
  // Score boundaries
  SCORE_BOUNDS: {
    MIN: 0,
    MAX: 100
  } as const,
  
  // Month mapping for date processing
  MONTH_MAP: {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  } as const,
  
  // Analytics configuration
  ANALYTICS: {
    DEFAULT_PAGE_SIZE: 50,
    MAX_CACHE_SIZE: 1000,
    TIME_FILTERS: ['all', 'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year'] as const,
    DAY_ORDER: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
  } as const,
  
  // Sheet processing configuration
  SHEET: {
    REQUIRED_HEADERS: [
      "Estimate Set (Yes/No)",
      "Lead Date", 
      "Name",
      "Email",
      "Phone", 
      "Zip",
      "Service",
      "Ad Set Name",
      "Ad Name", 
      "Unqualified Lead Reason"
    ] as const,
    
    // Valid estimate set values
    ESTIMATE_SET_TRUE_VALUES: ['TRUE', 'YES', 'true', 'yes', '1', 1, true] as const
  } as const,
  
  // Validation rules
  VALIDATION: {
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE_REGEX: /^[\+]?[1-9][\d]{0,15}$/,
    SHEET_URL_REGEX: /\/d\/([a-zA-Z0-9-_]+)/,
    GID_REGEX: /[?&#]gid=([0-9]+)/
  } as const,
  
  // Performance settings
  PERFORMANCE: {
    DEFAULT_AD_SET_PAGE_SIZE: 15,
    DEFAULT_AD_NAME_PAGE_SIZE: 10,
    MAX_BULK_OPERATIONS: 1000,
    CACHE_TTL: 300000 // 5 minutes in milliseconds
  } as const
} as const;

// Export individual configs for convenience
export const { FIELD_WEIGHTS, SCORE_BOUNDS, MONTH_MAP, ANALYTICS, SHEET, VALIDATION, PERFORMANCE } = LEAD_CONFIG;
