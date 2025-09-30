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
   * Convert an incoming lead date to UTC ISO string preserving provided timezone when present.
   * If no timezone info is present, assume UTC.
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
        // Treat Date object as UTC
        dateTime = DateTime.fromJSDate(dateValue, { zone: 'UTC' });
      } else if (typeof dateValue === 'string') {
        // Parse string date respecting embedded timezone if present; otherwise assume UTC
        dateTime = this.parseStringDateAssumingUTC(dateValue);
      } else if (typeof dateValue === 'number') {
        // Treat numeric timestamp as epoch millis in UTC
        dateTime = DateTime.fromMillis(dateValue, { zone: 'UTC' });
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
   * Parse a string date respecting embedded timezone; if absent, assume UTC.
   * @param dateString - The date string to parse
   * @returns DateTime object in appropriate timezone (or UTC when unspecified)
   */
  private static parseStringDateAssumingUTC(dateString: string): DateTime {
    const trimmed = dateString.trim();
    
    // Try different parsing approaches
    let dateTime: DateTime | null = null;

    // 1. Try parsing as ISO date (YYYY-MM-DD) - treat as midnight UTC
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
      dateTime = DateTime.fromISO(trimmed, { zone: 'UTC' });
    }
    // 2. Try parsing as space-separated datetime (YYYY-MM-DD H:mm:ss or HH:mm:ss) - assume UTC
    else if (/^\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}$/.test(trimmed)) {
      // Use flexible format that handles both single and double digit hours
      dateTime = DateTime.fromFormat(trimmed, 'yyyy-M-d H:m:s', { zone: 'UTC' });
    }
    // 3. Try parsing as ISO datetime with timezone info (YYYY-MM-DDTHH:mm:ss[Z|+/-HH:mm])
    else if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?([Z]|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
      // Parse with timezone info
      dateTime = DateTime.fromISO(trimmed);
    }
    // 4. Try parsing as ISO datetime without timezone (YYYY-MM-DDTHH:mm:ss) - assume UTC
    else if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?$/.test(trimmed)) {
      // Parse as ISO directly in UTC timezone
      dateTime = DateTime.fromISO(trimmed, { zone: 'UTC' });
    }
    // 5. Try parsing as US/European format (MM/DD/YYYY or DD/MM/YYYY) - assume UTC
    else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(trimmed)) {
      const parts = trimmed.split(/[-\/]/);
      if (parts.length === 3) {
        // Try MM/DD/YYYY first (US format)
        const usFormat = `${parts[0]}/${parts[1]}/${parts[2]}`;
        dateTime = DateTime.fromFormat(usFormat, 'M/d/yyyy', { zone: 'UTC' });
        
        // If invalid and might be DD/MM/YYYY, try that (European format)
        if (!dateTime.isValid && (parseInt(parts[0]) > 12 || parseInt(parts[1]) > 12)) {
          const euroFormat = `${parts[1]}/${parts[0]}/${parts[2]}`;
          dateTime = DateTime.fromFormat(euroFormat, 'M/d/yyyy', { zone: 'UTC' });
        }
      }
    }
    // 6. Fallback: Extract date and time components from any format
    else {
      // Try to extract YYYY-MM-DD and time parts from any format
      const dateTimeMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?/);
      if (dateTimeMatch) {
        const [, year, month, day, hour, minute, second, millisecond] = dateTimeMatch;
        try {
          const dateObj: any = {
            year: parseInt(year),
            month: parseInt(month),
            day: parseInt(day),
            hour: parseInt(hour),
            minute: parseInt(minute),
            second: parseInt(second)
          };
          
          // Add milliseconds if present
          if (millisecond) {
            dateObj.millisecond = parseInt(millisecond.padEnd(3, '0'));
          }
          
          dateTime = DateTime.fromObject(dateObj, { zone: 'UTC' });
        } catch (error) {
          // If manual construction fails, continue to other fallbacks
        }
      }
      
      // If manual extraction didn't work, try Luxon's built-in parsing
      if (!dateTime || !dateTime.isValid) {
        // First try parsing as-is (might have timezone info)
        dateTime = DateTime.fromISO(trimmed);
        if (!dateTime.isValid) {
          // If that fails, try parsing assuming UTC
          dateTime = DateTime.fromISO(trimmed, { zone: 'UTC' });
        }
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

  //Log date conversion for debugging
  private static logConversion(original: any, converted: string, rowIndex?: number): void {
    const rowInfo = rowIndex !== undefined ? ` for row ${rowIndex}` : '';
    console.log(`[TIMEZONE] Converted${rowInfo}: "${original}" → "${converted}" (UTC)`);
  }

  
}

export default TimezoneUtils;