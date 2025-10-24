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
      const userId = req.context.getUserId();
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
}

export default new UserController();