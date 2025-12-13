import { Request, Response } from "express";
import UserService from "../services/user/service/service.js";
import { UserRole } from "../middlewares/auth.middleware.js";
import { IUser } from "../services/user/domain/user.domain.js";
import utils from "../utils/utils.js";
import opportunitySyncCron from "../services/opportunities/cron/opportunitySync.cron.js";
import multiClientOpportunitySyncCron from "../services/opportunities/cron/multiClientOpportunitySync.cron.js";
import leadSheetsSyncCron from "../services/leads/cron/leadSheetsSync.cron.js";

class AdminController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  public upsertUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name, role = UserRole.USER, userId, status } = req.body;

      if (!email || !name) {
        utils.sendErrorResponse(res, "Email and name are required");
        return;
      }

      // Password is required only for new users
      if (!userId && !password) {
        utils.sendErrorResponse(res, "Password is required for new users");
        return;
      }
      // Validate status
      if (status !== undefined && !['active', 'inactive'].includes(status)) {
        utils.sendErrorResponse(res, {
          message: "Status must be either 'active' or 'inactive'",
          statusCode: 400
        });
        return;
      }

      const user = await this.userService.upsertUser({
        userId,
        email,
        password,
        name,
        role,
        status,
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
          status: user.status
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
      leadSheetUrl: user.leadSheetUrl || "",
      isEmailVerified: user.isEmailVerified,
      created_at: user.created_at,
      status: user.status
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

  public getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        utils.sendErrorResponse(res, "User ID is required");
        return;
      }

      const user = await this.userService.getUserByIdIncludeInactive(userId);

      if (!user) {
        utils.sendErrorResponse(res, "User not found");
        return;
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: this.formatUser(user),
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        utils.sendErrorResponse(res, "User ID is required");
        return;
      }

      await this.userService.deleteUser(userId);

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public updateUsersLoginStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userIds, hasLoggedIn } = req.body;

      // Validate input
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        utils.sendErrorResponse(res, "userIds array is required and must not be empty");
        return;
      }

      if (typeof hasLoggedIn !== 'boolean') {
        utils.sendErrorResponse(res, "hasLoggedIn must be a boolean value");
        return;
      }

      // Update each user's login status
      const results = [];
      const errors = [];

      for (const userId of userIds) {
        try {
          const updatedUser = await this.userService.updateUserLoginStatus(userId, hasLoggedIn);
          results.push({
            userId,
            success: true,
            user: {
              id: updatedUser._id,
              email: updatedUser.email,
              name: updatedUser.name,
              hasLoggedIn: updatedUser.hasLoggedIn
            }
          });
        } catch (error) {
          errors.push({
            userId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      const successCount = results.length;
      const errorCount = errors.length;

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: `Updated ${successCount} users successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        data: {
          totalRequested: userIds.length,
          successCount,
          errorCount,
          results,
          errors: errorCount > 0 ? errors : undefined
        }
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public triggerOpportunitySync = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.context.getUserId();

      // Check if cron is already running
      if (opportunitySyncCron.isRunningCheck()) {
        utils.sendErrorResponse(res, {
          message: "Opportunity sync cron is already running",
          statusCode: 409
        });
        return;
      }

      // Trigger the cron job and wait for completion
      await opportunitySyncCron.runOnce();

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Opportunity sync cron job completed successfully",
        data: {
          userId,
          status: "completed"
        }
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public triggerMultiClientOpportunitySync = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.context.getUserId();

      // Check if cron is already running
      if (multiClientOpportunitySyncCron.isRunningCheck()) {
        utils.sendErrorResponse(res, {
          message: "Multi-client opportunity sync cron is already running",
          statusCode: 409
        });
        return;
      }

      // Trigger the cron job and wait for completion
      await multiClientOpportunitySyncCron.runOnce('manual');

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Multi-client opportunity sync cron job completed successfully",
        data: {
          userId,
          status: "completed"
        }
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

  public triggerLeadSheetsSync = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.context.getUserId();

      // Check if cron is already running
      if (leadSheetsSyncCron.isRunningCheck()) {
        utils.sendErrorResponse(res, {
          message: "Lead sheets sync cron is already running",
          statusCode: 409
        });
        return;
      }

      // Trigger the cron job and wait for completion
      await leadSheetsSyncCron.runOnce();

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Lead sheets sync cron job completed successfully",
        data: {
          userId,
          status: "completed"
        }
      });
    } catch (error) {
      utils.sendErrorResponse(res, error);
    }
  };

}

export default new AdminController();