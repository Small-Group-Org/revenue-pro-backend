export class CustomError extends Error {
  public code: ErrorCode;
  public error: Error;

  constructor(code: ErrorCode, error: any) {
    super(error?.message || error);
    this.code = code;
    this.error = error;
    this.logWithContext();
  }

  logWithContext(): void {
    console.error("%s: %s", this.code, this.error);
  }
}

export enum ErrorCode {
  BAD_REQUEST = "BAD_REQUEST",
  SOMETHING_WENT_WRONG = "SOMETHING_WENT_WRONG",
  INVALID_INPUT = "INVALID_INPUT",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  FORBIDDEN = "FORBIDDEN",
}

export const ErrorCodeStatusMap: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.SOMETHING_WENT_WRONG]: 500,
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.INVALID_INPUT]: 422,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.AUTHENTICATION_ERROR]: 401,
  [ErrorCode.FORBIDDEN]: 403,
};
