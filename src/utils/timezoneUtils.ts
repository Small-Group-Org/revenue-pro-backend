import { DateTime } from 'luxon';
import { TIMEZONE_CONFIG, LEAD_TIMEZONE, STORAGE_TIMEZONE } from '../config/timezone.js';

/**
 * Timezone Utility Service
 * Handles CST to UTC conversion for lead date processing
 * Returns ISO string format for database storage
 */

export interface DateConversionResult {
  success: boolean;
  utcIsoString?: string;
  error?: string;
  originalValue?: any;
}

export class TimezoneUtils {
  /**
   * Convert a lead date from CST to UTC and return as ISO string
   * @param dateValue - The incoming date value (string, Date, or number)
   * @param rowIndex - Optional row index for logging
   * @returns DateConversionResult with UTC ISO string or error
   */
  public static convertLeadDateToUTCString(
    dateValue: any, 
    rowIndex?: number
  ): DateConversionResult {
    if (!dateValue) {
      return {
        success: false,
        error: 'Date value is empty or null',
        originalValue: dateValue
      };
    }

    try {
      let dateTime: DateTime;

      // Handle different input types
      if (dateValue instanceof Date) {
        // If it's already a Date object, assume it's in CST
        dateTime = DateTime.fromJSDate(dateValue, { zone: LEAD_TIMEZONE });
      } else if (typeof dateValue === 'string') {
        // Parse string date in CST timezone
        dateTime = this.parseStringDateInCST(dateValue);
      } else if (typeof dateValue === 'number') {
        // Handle timestamp - assume it's in CST
        dateTime = DateTime.fromMillis(dateValue, { zone: LEAD_TIMEZONE });
      } else {
        return {
          success: false,
          error: `Unsupported date type: ${typeof dateValue}`,
          originalValue: dateValue
        };
      }

      // Validate the parsed date
      if (!dateTime.isValid) {
        return {
          success: false,
          error: `Invalid date: ${dateTime.invalidReason}`,
          originalValue: dateValue
        };
      }

      // Convert to UTC
      const utcDateTime = dateTime.toUTC();
      
      // Validate the conversion
      if (!utcDateTime.isValid) {
        return {
          success: false,
          error: `Failed to convert to UTC: ${utcDateTime.invalidReason}`,
          originalValue: dateValue
        };
      }

      // Additional validation
      const validationResult = this.validateDate(utcDateTime.toJSDate());
      if (!validationResult.isValid) {
        return {
          success: false,
          error: validationResult.error,
          originalValue: dateValue
        };
      }

      // Convert to ISO string for database storage
      const utcIsoString = utcDateTime.toISO();
      
      if (!utcIsoString) {
        return {
          success: false,
          error: 'Failed to convert to ISO string',
          originalValue: dateValue
        };
      }

      // Log conversion for debugging
      this.logConversion(dateValue, utcIsoString, rowIndex);

      return {
        success: true,
        utcIsoString: utcIsoString,
        originalValue: dateValue
      };

    } catch (error) {
      return {
        success: false,
        error: `Date conversion error: ${error instanceof Error ? error.message : String(error)}`,
        originalValue: dateValue
      };
    }
  }

  /**
   * Parse a string date assuming it's in CST timezone
   * @param dateString - The date string to parse
   * @returns DateTime object in CST timezone
   */
  private static parseStringDateInCST(dateString: string): DateTime {
    const trimmed = dateString.trim();
    
    // Try different parsing approaches
    let dateTime: DateTime | null = null;

    // 1. Try parsing as ISO date (YYYY-MM-DD) - treat as midnight CST
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
      dateTime = DateTime.fromISO(trimmed, { zone: LEAD_TIMEZONE });
    }
    // 2. Try parsing as ISO datetime with timezone info (YYYY-MM-DDTHH:mm:ss[Z|+/-HH:mm])
    else if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?([Z]|[+-]\d{2}:?\d{2})?$/.test(trimmed)) {
      // Parse with timezone info, then convert to CST
      dateTime = DateTime.fromISO(trimmed);
      if (dateTime.isValid) {
        // Convert to CST timezone
        dateTime = dateTime.setZone(LEAD_TIMEZONE);
      }
    }
    // 3. Try parsing as ISO datetime without timezone (YYYY-MM-DDTHH:mm:ss) - treat as CST
    else if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?$/.test(trimmed)) {
      dateTime = DateTime.fromISO(trimmed, { zone: LEAD_TIMEZONE });
    }
    // 4. Try parsing as US/European format (MM/DD/YYYY or DD/MM/YYYY)
    else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(trimmed)) {
      const parts = trimmed.split(/[-\/]/);
      if (parts.length === 3) {
        // Try MM/DD/YYYY first (US format)
        const usFormat = `${parts[0]}/${parts[1]}/${parts[2]}`;
        dateTime = DateTime.fromFormat(usFormat, 'M/d/yyyy', { zone: LEAD_TIMEZONE });
        
        // If invalid and might be DD/MM/YYYY, try that (European format)
        if (!dateTime.isValid && (parseInt(parts[0]) > 12 || parseInt(parts[1]) > 12)) {
          const euroFormat = `${parts[1]}/${parts[0]}/${parts[2]}`;
          dateTime = DateTime.fromFormat(euroFormat, 'M/d/yyyy', { zone: LEAD_TIMEZONE });
        }
      }
    }
    // 5. Fallback: Let Luxon try to parse it with timezone handling
    else {
      // First try parsing as-is (might have timezone info)
      dateTime = DateTime.fromISO(trimmed);
      if (dateTime.isValid) {
        // Convert to CST timezone
        dateTime = dateTime.setZone(LEAD_TIMEZONE);
      } else {
        // If that fails, try parsing as CST
        dateTime = DateTime.fromISO(trimmed, { zone: LEAD_TIMEZONE });
      }
    }

    if (!dateTime || !dateTime.isValid) {
      throw new Error(`Unable to parse date string: "${dateString}"`);
    }

    return dateTime;
  }

  /**
   * Validate a date against business rules
   * @param date - The date to validate
   * @returns Validation result
   */
  private static validateDate(date: Date): { isValid: boolean; error?: string } {
    const year = date.getFullYear();
    const now = new Date();
    const maxFutureDate = new Date(now.getTime() + (TIMEZONE_CONFIG.validation.maxFutureDays * 24 * 60 * 60 * 1000));

    // Check year range
    if (year < TIMEZONE_CONFIG.validation.minYear) {
      return {
        isValid: false,
        error: `Date year ${year} is before minimum allowed year ${TIMEZONE_CONFIG.validation.minYear}`
      };
    }

    if (year > TIMEZONE_CONFIG.validation.maxYear) {
      return {
        isValid: false,
        error: `Date year ${year} is after maximum allowed year ${TIMEZONE_CONFIG.validation.maxYear}`
      };
    }

    // Check if date is too far in the future
    if (date > maxFutureDate) {
      return {
        isValid: false,
        error: `Date is more than ${TIMEZONE_CONFIG.validation.maxFutureDays} days in the future`
      };
    }

    return { isValid: true };
  }

  /**
   * Log date conversion for debugging
   * @param original - Original date value
   * @param converted - Converted UTC ISO string
   * @param rowIndex - Optional row index
   */
  private static logConversion(original: any, converted: string, rowIndex?: number): void {
    const rowInfo = rowIndex !== undefined ? ` for row ${rowIndex}` : '';
    console.log(`[TIMEZONE] Converted${rowInfo}: "${original}" (CST) → "${converted}" (UTC)`);
  }

  /**
   * Convert UTC ISO string back to CST for display
   * @param utcIsoString - UTC ISO string from database
   * @returns Date in CST timezone
   */
  public static convertUTCStringToCST(utcIsoString: string): Date {
    const utcDateTime = DateTime.fromISO(utcIsoString, { zone: STORAGE_TIMEZONE });
    const cstDateTime = utcDateTime.setZone(LEAD_TIMEZONE);
    return cstDateTime.toJSDate();
  }

  /**
   * Get current time in CST as ISO string
   * @returns Current time in CST as ISO string
   */
  public static getCurrentCSTTimeAsISO(): string {
    const iso = DateTime.now().setZone(LEAD_TIMEZONE).toISO();
    return iso || '';
  }

  /**
   * Get current time in UTC as ISO string
   * @returns Current time in UTC as ISO string
   */
  public static getCurrentUTCTimeAsISO(): string {
    const iso = DateTime.now().toUTC().toISO();
    return iso || '';
  }

  /**
   * Format UTC ISO string for display in CST
   * @param utcIsoString - UTC ISO string from database
   * @param format - Luxon format string
   * @returns Formatted date string in CST
   */
  public static formatUTCStringInCST(utcIsoString: string, format: string = 'yyyy-MM-dd'): string {
    const utcDateTime = DateTime.fromISO(utcIsoString, { zone: STORAGE_TIMEZONE });
    const cstDateTime = utcDateTime.setZone(LEAD_TIMEZONE);
    return cstDateTime.toFormat(format);
  }

  /**
   * Create a date range query for MongoDB using ISO strings
   * @param startDate - Start date in CST (YYYY-MM-DD format)
   * @param endDate - End date in CST (YYYY-MM-DD format)
   * @returns MongoDB query object with UTC ISO strings
   */
  public static createDateRangeQuery(startDate: string, endDate: string): { leadDate: { $gte: string; $lte: string } } {
    // Convert start date to UTC
    const startCST = DateTime.fromISO(startDate, { zone: LEAD_TIMEZONE });
    const startUTC = startCST.toUTC().toISO();
    
    // Convert end date to UTC (end of day)
    const endCST = DateTime.fromISO(endDate, { zone: LEAD_TIMEZONE }).endOf('day');
    const endUTC = endCST.toUTC().toISO();
    
    if (!startUTC || !endUTC) {
      throw new Error('Failed to convert dates to UTC ISO strings');
    }
    
    return {
      leadDate: {
        $gte: startUTC,
        $lte: endUTC
      }
    };
  }
}

export default TimezoneUtils;