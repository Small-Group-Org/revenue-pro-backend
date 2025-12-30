export class CustomError extends Error {
    constructor(code, error) {
        super(error?.message || error);
        this.code = code;
        this.error = error;
        this.logWithContext();
    }
    logWithContext() {
        console.error("%s: %s", this.code, this.error);
    }
}
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["BAD_REQUEST"] = "BAD_REQUEST";
    ErrorCode["SOMETHING_WENT_WRONG"] = "SOMETHING_WENT_WRONG";
    ErrorCode["INVALID_INPUT"] = "INVALID_INPUT";
    ErrorCode["INTERNAL_SERVER_ERROR"] = "INTERNAL_SERVER_ERROR";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ErrorCode["AUTHENTICATION_ERROR"] = "AUTHENTICATION_ERROR";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["CONFLICT"] = "CONFLICT";
})(ErrorCode || (ErrorCode = {}));
export const ErrorCodeStatusMap = {
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
    [ErrorCode.CONFLICT]: 409,
};
