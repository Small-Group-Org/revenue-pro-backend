import utils from "../utils/utils.js";
import di from "../di/di.js";
import { CustomError, ErrorCode } from "../pkg/error/custom_error.js";
class AuthController {
    constructor(authService) {
        this.login = async (req, res) => {
            try {
                const resp = await this.authService.login(req);
                utils.sendSuccessResponse(res, 200, { user: resp.user, token: resp.token });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.register = async (req, res) => {
            try {
                const resp = await this.authService.register(req.context, req);
                utils.sendSuccessResponse(res, 200, { user: resp.user });
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.verifyToken = async (req, res) => {
            try {
                const resp = await this.authService.verifyToken(req.context, req);
                if (!resp.valid) {
                    utils.sendErrorResponse(res, new CustomError(ErrorCode.UNAUTHORIZED, resp.error || "Authentication failed"));
                    return;
                }
                utils.sendSuccessResponse(res, 200, {
                    user: resp.user,
                    accessToken: resp.accessToken
                });
            }
            catch (error) {
                if (error instanceof CustomError) {
                    utils.sendErrorResponse(res, error);
                }
                else {
                    utils.sendErrorResponse(res, new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, "Authentication failed"));
                }
            }
        };
        this.logout = (req, res) => {
            utils.sendSuccessResponse(res, 200, { message: "Logged out successfully" });
        };
        this.forgotPassword = async (req, res) => {
            try {
                const resp = await this.authService.forgotPassword(req.context, req);
                utils.sendSuccessResponse(res, 200, resp);
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.resetPassword = async (req, res) => {
            try {
                const resp = await this.authService.resetPassword(req.context, req);
                utils.sendSuccessResponse(res, 200, resp);
            }
            catch (error) {
                utils.sendErrorResponse(res, error);
            }
        };
        this.authService = authService;
    }
}
export default new AuthController(di.AuthService());
