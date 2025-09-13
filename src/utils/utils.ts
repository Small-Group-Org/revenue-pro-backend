import {
  ErrorCode,
  CustomError,
  ErrorCodeStatusMap,
} from "../pkg/error/custom_error.js";
import { Response } from "express";
import { TimezoneUtils } from "./timezoneUtils.js";

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
   * Parse various date formats and convert from CST to UTC
   * Handles multiple formats: MM-DD-YYYY, MM/DD/YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
   * Returns UTC ISO string for database storage
   * 
   * @param dateValue - Date value to parse (Date object, string, or number)
   * @param rowIndex - Optional row index for logging purposes
   * @returns UTC ISO string or empty string if invalid
   */
  public parseDate(dateValue: any, rowIndex?: number): string {
    if (!dateValue) return "";

    try {
      // Use the new timezone utility for consistent CST to UTC conversion
      const result = TimezoneUtils.convertLeadDateToUTCString(dateValue, rowIndex);
      
      if (result.success && result.utcIsoString) {
        return result.utcIsoString;
      } else {
        this.logDateWarning(`Timezone conversion failed: ${result.error}`, dateValue, rowIndex);
        return "";
      }
    } catch (error) {
      this.logDateWarning(`Date parsing error: ${error}`, dateValue, rowIndex);
      return "";
    }
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
