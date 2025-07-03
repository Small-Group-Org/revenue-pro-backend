import { Request, Response } from "express";
import utils from "../utils/utils.js";
import AuthService from "../services/auth/service/service.js";
import di from "../di/di.js";
import { CustomError, ErrorCode } from "../pkg/error/custom_error.js";

class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  public googleAuth = async (req: Request, res: Response): Promise<void> => {
    try {
      const resp = await this.authService.googleAuth(req.context, req);
      utils.sendSuccessResponse(res, 200, { token: resp.token, user: resp.user });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const resp = await this.authService.login(req.context, req);
      utils.sendSuccessResponse(res, 200, { user: resp.user });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public register = async (req: Request, res: Response): Promise<void> => {
    try {
      const resp = await this.authService.register(req.context, req);
      utils.sendSuccessResponse(res, 200, { user: resp.user });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public verifyToken = async (req: Request, res: Response): Promise<void> => {
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
    } catch (error) {
      if (error instanceof CustomError) {
        utils.sendErrorResponse(res, error);
      } else {
        utils.sendErrorResponse(res, new CustomError(ErrorCode.INTERNAL_SERVER_ERROR, "Authentication failed"));
      }
    }
  };

  public logout = (req: Request, res: Response): void => {
    utils.sendSuccessResponse(res, 200, { message: "Logged out successfully" });
  };

  public forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const resp = await this.authService.forgotPassword(req.context, req);
      utils.sendSuccessResponse(res, 200, resp);
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const resp = await this.authService.resetPassword(req.context, req);
      utils.sendSuccessResponse(res, 200, resp);
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };
}

export default new AuthController(di.AuthService());
