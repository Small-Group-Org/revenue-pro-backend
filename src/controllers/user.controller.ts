import { Request, Response } from "express";
import UserService from "../services/user/service/service.js";
import utils from "../utils/utils.js";

class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  public getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      // Use the ID from route params (req.params.id) if provided
      // Otherwise fall back to authenticated user's ID for backward compatibility
      const userId = req.params.id || req.context.getUserId();
      
      if (!userId) {
        utils.sendErrorResponse(res, "User ID is required");
        return;
      }
      
      const user = await this.userService.getUserById(userId);

      if (!user) {
        utils.sendErrorResponse(res, "User not found");
        return;
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          imageURL: user.imageURL,
          isEmailVerified: user.isEmailVerified,
          hasLoggedIn: user.hasLoggedIn,
          hasSeenLatestUpdate: user.hasSeenLatestUpdate,
          fbAdAccountId: user.fbAdAccountId,
          fbPixelId: user.fbPixelId,
          metaAccessToken: user.metaAccessToken,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.context.getUserId();
      const { name, email,  role, isEmailVerified } = req.body;

      const updatedUser = await this.userService.updateUserDetails(userId, {
        name,
        email,
        role,
        isEmailVerified
      });

      if (!updatedUser) {
        utils.sendErrorResponse(res, "User not found");
        return;
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Profile updated successfully",
        data: {
          id: updatedUser._id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          imageURL: updatedUser.imageURL,
          isEmailVerified: updatedUser.isEmailVerified,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public updatePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, newPassword } = req.body;

      if (!userId || !newPassword) {
        utils.sendErrorResponse(res, "userId and newPassword are required");
        return;
      }

      await this.userService.updateUserPassword(userId, newPassword);

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public updateLastAccess = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.context.getUserId();
      
      const updatedUser = await this.userService.updateLastAccessAt(userId);

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Last access time updated successfully",
        data: {
          id: updatedUser._id,
          lastAccessAt: updatedUser.lastAccessAt,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public markUpdateAsSeen = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const userId = req.context.getUserId();

      const updatedUser = await this.userService.markUpdateAsSeen(userId);

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Update marked as seen successfully",
        data: {
          id: updatedUser._id,
          hasSeenLatestUpdate: updatedUser.hasSeenLatestUpdate,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public updateFbAdAccountId = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const clientId = req.params.clientId;
      const { fbAdAccountId } = req.body;

      if (!clientId) {
        utils.sendErrorResponse(res, "clientId is required in route params");
        return;
      }

      if (!fbAdAccountId) {
        utils.sendErrorResponse(res, "fbAdAccountId is required in request body");
        return;
      }

      // Validate format (should be numeric or act_XXXXX)
      const isValid = /^(act_)?\d+$/.test(fbAdAccountId);
      if (!isValid) {
        utils.sendErrorResponse(res, "Invalid ad account ID format. Should be numeric or act_XXXXX");
        return;
      }

      const updatedUser = await this.userService.updateFbAdAccountId(clientId, fbAdAccountId);

      if (!updatedUser) {
        utils.sendErrorResponse(res, "User not found");
        return;
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Facebook ad account ID updated successfully",
        data: {
          id: updatedUser._id,
          fbAdAccountId: updatedUser.fbAdAccountId,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public updateFacebookPixel = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const clientId = req.params.clientId;
      const { fbPixelId, fbPixelToken } = req.body;

      if (!clientId) {
        utils.sendErrorResponse(res, "clientId is required in route params");
        return;
      }

      if (!fbPixelId || !fbPixelToken) {
        utils.sendErrorResponse(res, "fbPixelId and fbPixelToken are required in request body");
        return;
      }

      // Validate pixel ID format (should be numeric)
      const isValidPixelId = /^\d+$/.test(fbPixelId);
      if (!isValidPixelId) {
        utils.sendErrorResponse(res, "Invalid pixel ID format. Should be numeric");
        return;
      }

      const updatedUser = await this.userService.updateFacebookPixel(clientId, fbPixelId, fbPixelToken);

      if (!updatedUser) {
        utils.sendErrorResponse(res, "User not found");
        return;
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Facebook pixel credentials updated successfully",
        data: {
          id: updatedUser._id,
          fbPixelId: updatedUser.fbPixelId,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };
}

export default new UserController();