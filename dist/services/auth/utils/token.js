import { CustomError, ErrorCode } from "../../../pkg/error/custom_error.js";
import { config } from "../../../config.js";
import jwt from "jsonwebtoken";
import di from "../../../di/di.js";
export const createToken = (payload) => {
    if (!config.ACCESS_TOKEN_SECRET || !config.REFRESH_TOKEN_SECRET) {
        throw new Error("Token secrets are not defined");
    }
    const accessTokenOptions = {
        expiresIn: (config.ACCESS_TOKEN_LIFE || "15m"),
    };
    const refreshTokenOptions = {
        expiresIn: (config.REFRESH_TOKEN_LIFE || "7d"),
    };
    const accessToken = jwt.sign({ data: payload }, config.ACCESS_TOKEN_SECRET, accessTokenOptions);
    const refreshToken = jwt.sign({ data: payload }, config.REFRESH_TOKEN_SECRET, refreshTokenOptions);
    return { accessToken, refreshToken };
};
export const returnToken = (refreshToken) => {
    try {
        if (!config.REFRESH_TOKEN_SECRET) {
            throw new Error("Refresh token secret is not defined");
        }
        const refreshPayload = jwt.verify(refreshToken, config.REFRESH_TOKEN_SECRET);
        const newToken = createToken(refreshPayload.data);
        return newToken.accessToken;
    }
    catch (error) {
        return null;
    }
};
export const verifyToken = async (accessToken, refreshToken) => {
    try {
        if (!accessToken || !refreshToken) {
            throw new CustomError(ErrorCode.UNAUTHORIZED, {
                message: "Token is required",
                status: 401
            });
        }
        if (!config.ACCESS_TOKEN_SECRET || !config.REFRESH_TOKEN_SECRET) {
            throw new CustomError(ErrorCode.UNAUTHORIZED, {
                message: "Token configuration is missing",
                status: 401
            });
        }
        try {
            const decoded = jwt.verify(accessToken, config.ACCESS_TOKEN_SECRET);
            const user = await di.UserService().getUserById(decoded.data.id);
            if (!user) {
                throw new CustomError(ErrorCode.UNAUTHORIZED, {
                    message: "User not found",
                    status: 401
                });
            }
            if (!user.role) {
                throw new CustomError(ErrorCode.FORBIDDEN, {
                    message: "Insufficient permissions",
                    status: 403
                });
            }
            return {
                valid: true,
                accessToken: accessToken,
                user: user
            };
        }
        catch (error) {
            if (error instanceof CustomError && error.code === ErrorCode.FORBIDDEN) {
                throw error; // Preserve the original FORBIDDEN error
            }
            if (error.name === "TokenExpiredError") {
                const newToken = returnToken(refreshToken);
                if (newToken) {
                    try {
                        const decoded = jwt.verify(newToken, config.ACCESS_TOKEN_SECRET);
                        const user = await di.UserService().getUserById(decoded.data.id);
                        if (!user) {
                            throw new CustomError(ErrorCode.UNAUTHORIZED, {
                                message: "User not found",
                                status: 401
                            });
                        }
                        if (!user.role) {
                            throw new CustomError(ErrorCode.FORBIDDEN, {
                                message: "Insufficient permissions",
                                status: 403
                            });
                        }
                        return {
                            valid: true,
                            accessToken: newToken,
                            user: user
                        };
                    }
                    catch (refreshError) {
                        throw new CustomError(ErrorCode.UNAUTHORIZED, {
                            message: "Invalid refresh token",
                            status: 401
                        });
                    }
                }
                throw new CustomError(ErrorCode.UNAUTHORIZED, {
                    message: "Token expired and could not be refreshed",
                    status: 401
                });
            }
            else if (error.name === "JsonWebTokenError") {
                throw new CustomError(ErrorCode.UNAUTHORIZED, {
                    message: "Invalid token format or signature",
                    status: 401
                });
            }
            throw new CustomError(ErrorCode.UNAUTHORIZED, {
                message: "Invalid token",
                status: 401
            });
        }
    }
    catch (error) {
        if (error instanceof CustomError && error.code === ErrorCode.FORBIDDEN) {
            throw error; // Preserve the original FORBIDDEN error
        }
        throw new CustomError(ErrorCode.UNAUTHORIZED, {
            message: error.message || "Authentication failed",
            status: 401
        });
    }
};
