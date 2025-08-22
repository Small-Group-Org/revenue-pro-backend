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
}

export default new utils();
