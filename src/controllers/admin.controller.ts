import { Request, Response } from "express";
import UserService from "../services/user/service/service.js";
import { UserRole } from "../middlewares/auth.middleware.js";
import { IUser } from "../services/user/domain/user.domain.js";
import utils from "../utils/utils.js";

class AdminController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  public upsertUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name, role = UserRole.CLIENT, userId } = req.body;

      if (!email || !name) {
        utils.sendErrorResponse(res, "Email and name are required");
        return;
      }

      // Password is required only for new users
      if (!userId && !password) {
        utils.sendErrorResponse(res, "Password is required for new users");
        return;
      }

      const user = await this.userService.upsertUser({
        userId,
        email,
        password,
        name,
        role,
        isEmailVerified: false,
      });

      utils.sendSuccessResponse(res, 201, {
        success: true,
        message: userId ? "User updated successfully" : "User created successfully",
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  private formatUser(user: IUser): object {
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      created_at: user.created_at,
    };
  }

  public getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const role = (req.query?.role ?? "") as string;
      const users = await this.userService.getAllUsers(role);
      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: users.map(this.formatUser),
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };
}

export default new AdminController();