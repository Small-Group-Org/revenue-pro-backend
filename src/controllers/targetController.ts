import { Request, Response } from "express";
import { TargetService } from "../services/target/service/service.js";
import utils from "../utils/utils.js";
import { parseISO } from "date-fns";

export class TargetController {
  private service: TargetService;

  constructor() {
    this.service = new TargetService();
    this.upsertTarget = this.upsertTarget.bind(this);
    this.getTargets = this.getTargets.bind(this);
  }

  async upsertTarget(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, queryType, ...targetData } = req.body;
      const user = req.context.getUser();
      let userId: string;
      if (user && user.role === 'ADMIN' && req.body.userId) {
        userId = req.body.userId;
      } else {
        userId = req.context.getUserId();
      }

      if (!startDate || !queryType) {
        utils.sendErrorResponse(res, "startDate and queryType are required");
        return;
      }

      const validTypes = ["monthly", "yearly"];
      if (!validTypes.includes(queryType as string)) {
        utils.sendErrorResponse(res, "queryType must be one of: monthly, yearly");
        return;
      }

      const parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        utils.sendErrorResponse(res, "Invalid startDate format. Please use YYYY-MM-DD format");
        return;
      }

      // Only pass the allowed fields for target
      const allowedFields = [
        "appointmentRate",
        "avgJobSize",
        "closeRate",
        "com",
        "revenue",
        "showRate",
        "startDate",
        "endDate",
        "queryType",
        "userId",
        "year",
        "weekNumber"
      ];
      const filteredTargetData: any = {};
      for (const key of allowedFields) {
        if (key in targetData) {
          filteredTargetData[key] = targetData[key];
        }
      }

      const result = await this.service.upsertTargetByPeriod(userId, parsedStartDate, queryType, filteredTargetData);
      utils.sendSuccessResponse(res, 200, { success: true, data: result });
    } catch (error) {
      console.error("Error in upsertTarget:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async getTargets(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, queryType } = req.query;
      const userIdRaw = req.query.userId;
      const userId = Array.isArray(userIdRaw) ? userIdRaw[0] : userIdRaw;

      if (typeof userId !== "string") {
        utils.sendErrorResponse(res, "Invalid userId");
        return;
      }

      if (!startDate || !queryType) {
        utils.sendErrorResponse(res, "startDate and type are required query parameters");
        return;
      }

      const validTypes = ["weekly", "monthly", "yearly"];
      if (!validTypes.includes(queryType as string)) {
        utils.sendErrorResponse(res, "type must be one of: weekly, monthly, yearly");
        return;
      }

      const parsedStartDate = parseISO(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        utils.sendErrorResponse(res, "Invalid startDate format. Please use YYYY-MM-DD format");
        return;
      }

      let results;
      switch (queryType) {
        case "weekly":
          results = await this.service.getWeeklyTarget(userId, parsedStartDate);
          break;
        case "monthly":
          results = await this.service.getAggregatedMonthlyTarget(userId, parsedStartDate.getFullYear(), parsedStartDate.getMonth() + 1, "monthly"); // Pass year and month
          break;
        case "yearly":
          results = await this.service.getAggregatedYearlyTarget(
            userId,
            parsedStartDate.getFullYear(),
            "yearly"
          );
          break;
      }

      utils.sendSuccessResponse(res, 200, { success: true, data: results });
    } catch (error) {
      console.error("Error in getTargets:", error)
      utils.sendErrorResponse(res, error);
    }
  }
}