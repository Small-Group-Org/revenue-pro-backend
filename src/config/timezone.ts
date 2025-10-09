/**
 * Timezone Configuration
 * Centralized timezone handling for lead date processing
 */

// Source timezone for all incoming lead dates
export const LEAD_TIMEZONE = "America/Chicago";

// Target timezone for database storage (always UTC)
export const STORAGE_TIMEZONE = "UTC";

export const TIMEZONE_CONFIG = {
  source: LEAD_TIMEZONE,
  
  storage: STORAGE_TIMEZONE,
  
  // Default time for date-only inputs (midnight in source timezone)
  defaultTime: "00:00:00",
  
  // Supported date formats for parsing
  supportedFormats: [
    "yyyy-MM-dd",           // 2025-03-20
    "yyyy-MM-dd HH:mm:ss",  // 2025-03-20 16:45:13
    "yyyy-MM-ddTHH:mm:ss",  // 2025-03-20T16:45:13
    "MM/dd/yyyy",           // 03/20/2025
    "MM-dd-yyyy",           // 03-20-2025
    "dd/MM/yyyy",           // 20/03/2025
    "dd-MM-yyyy",           // 20-03-2025
  ],
  
  // Validation rules
  validation: {
    // Minimum year allowed
    minYear: 2020,
    
    // Maximum year allowed (current year + 2)
    maxYear: new Date().getFullYear() + 2,
    
    // Reject future dates beyond this many days
    maxFutureDays: 365,
  }
} as const;

export default TIMEZONE_CONFIG;
