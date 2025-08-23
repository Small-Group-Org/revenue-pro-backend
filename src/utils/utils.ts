import {
  ErrorCode,
  CustomError,
  ErrorCodeStatusMap,
} from "../pkg/error/custom_error.js";
import { Response } from "express";

interface ResponseData {
  success: boolean;
  message: any;
  data?: any;
}

class utils {
  now = (): number => Math.floor(Date.now() / 1000);

  public ThrowableError(
    error: any,
    code: ErrorCode = ErrorCode.SOMETHING_WENT_WRONG,
  ): CustomError {
    if (error instanceof CustomError) {
      return error;
    }
    return new CustomError(code, error);
  }

  public sendSuccessResponse(
    res: Response,
    statusCode: number,
    data: any,
  ): Response {
    return res.status(statusCode).json(data);
  }

  public sendErrorResponse(res: Response, error: any): Response {
    let code = 500;
    let message = "Internal Server Error";

    if (error instanceof CustomError) {
      code = ErrorCodeStatusMap[error.code];
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object' && error.message) {
      message = error.message;
    }

    return res.status(code).json({
      message: message,
      status: code,
    });
  }

  /**
   * Parse various date formats into ISO date string (YYYY-MM-DD)
   * Handles multiple formats: MM-DD-YYYY, MM/DD/YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
   * Returns empty string for invalid dates
   * 
   * @param dateValue - Date value to parse (Date object, string, or number)
   * @param rowIndex - Optional row index for logging purposes
   * @returns ISO date string (YYYY-MM-DD) or empty string if invalid
   */
  public parseDate(dateValue: any, rowIndex?: number): string {
    if (!dateValue) return "";

    try {
      if (dateValue instanceof Date) {
        // Check if it's a valid date object
        if (!isNaN(dateValue.getTime())) {
          return dateValue.toISOString().slice(0, 10);
        } else {
          this.logDateWarning(`Invalid Date object`, dateValue, rowIndex);
          return "";
        }
      } else {
        // Handle string/number date formats
        let dateString = String(dateValue).trim();
        let parsedDate: Date | null = null;
        
        // Try multiple date formats
        if (dateString) {
          // Format: MM-DD-YYYY or MM/DD/YYYY or M/D/YYYY etc.
          if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(dateString)) {
            // Replace any separator with / for consistent parsing
            const normalizedDate = dateString.replace(/[-]/g, '/');
            parsedDate = new Date(normalizedDate);
          }
          // Format: YYYY-MM-DD
          else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateString)) {
            parsedDate = new Date(dateString);
          }
          // Format: DD-MM-YYYY or DD/MM/YYYY (European format)
          else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(dateString)) {
            // Try as MM/DD/YYYY first, then DD/MM/YYYY if invalid
            const parts = dateString.split(/[-\/]/);
            if (parts.length === 3) {
              // Try MM/DD/YYYY format first
              const usFormat = `${parts[0]}/${parts[1]}/${parts[2]}`;
              parsedDate = new Date(usFormat);
              
              // If invalid and might be DD/MM/YYYY, try that
              if (isNaN(parsedDate.getTime()) && parseInt(parts[0]) > 12) {
                const euroFormat = `${parts[1]}/${parts[0]}/${parts[2]}`;
                parsedDate = new Date(euroFormat);
              }
            }
          }
          // Fallback: Let JavaScript try to parse it
          else {
            parsedDate = new Date(dateString);
          }
          
          // Validate the parsed date
          if (parsedDate && !isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().slice(0, 10);
          } else {
            this.logDateWarning(`Unable to parse date`, dateValue, rowIndex);
            return "";
          }
        }
      }
    } catch (dateError) {
      this.logDateWarning(`Date parsing error: ${dateError}`, dateValue, rowIndex);
      return "";
    }

    return "";
  }

  /**
   * Log date parsing warnings with consistent format
   * @param message - Warning message
   * @param dateValue - Original date value
   * @param rowIndex - Optional row index
   */
  private logDateWarning(message: string, dateValue: any, rowIndex?: number): void {
    const rowInfo = rowIndex !== undefined ? ` for row ${rowIndex}` : '';
    console.warn(`${message}${rowInfo}: "${dateValue}"`);
  }
}

export default new utils();
