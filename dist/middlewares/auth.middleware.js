import bcrypt from "bcrypt";
import { verifyToken } from "../services/auth/utils/token.js";
const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);
export const encryptPassword = (password) => bcrypt.hashSync(password, salt);
export const comparePassword = (password, hashedPassword) => bcrypt.compareSync(password, hashedPassword);
export const verifyTokenMiddleware = async (req, res, next) => {
    try {
        const accessToken = req.headers.accesstoken;
        const refreshToken = req.headers.refreshtoken;
        if (!accessToken || !refreshToken) {
            throw new Error("Access token and refresh token are required");
        }
        const result = await verifyToken(accessToken.toString(), refreshToken.toString());
        if (!result?.user || result?.user.status === 'deleted') {
            throw new Error("User not found");
        }
        req.context.setUserId(result?.user?._id.toString());
        req.context.setOrgId(result?.user?._id.toString());
        req.context.setUser(result?.user);
        next();
    }
    catch (error) {
        res.status(401).json({
            success: false,
            message: "Unauthorized - Invalid or missing token",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
export var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["USER"] = "USER";
})(UserRole || (UserRole = {}));
export const checkRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            const user = req.context.getUser();
            if (!user || !user.role) {
                res.status(403).json({
                    success: false,
                    message: "Access denied - Role not found",
                });
                return;
            }
            if (!allowedRoles.includes(user.role)) {
                res.status(403).json({
                    success: false,
                    message: "Access denied - Insufficient permissions",
                });
                return;
            }
            next();
        }
        catch (error) {
            res.status(403).json({
                success: false,
                message: "Access denied",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    };
};
export const isAdmin = checkRole([UserRole.ADMIN]);
export const isUser = checkRole([UserRole.USER]);
export const isAdminOrUser = checkRole([UserRole.ADMIN, UserRole.USER]);
