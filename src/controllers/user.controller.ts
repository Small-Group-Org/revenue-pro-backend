import { Request, Response } from "express";
import UserService from "../services/user/service/service.js";

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
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          imageURL: user.imageURL,
          isEmailVerified: user.isEmailVerified,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching user profile",
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
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
      res.status(500).json({
        success: false,
        message: "Error updating user profile",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

export default new UserController(); 