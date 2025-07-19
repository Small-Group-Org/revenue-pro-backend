import { Request, Response } from "express";
import { TargetService } from "../services/target/service/service.js";
import utils from "../utils/utils.js";
import { parseISO } from "date-fns";
import moment from "moment-timezone";

export class TargetController {
  private service: TargetService;

  constructor() {
    this.service = new TargetService();
    this.upsertTarget = this.upsertTarget.bind(this);
    this.getTargets = this.getTargets.bind(this);
  }

  async upsertTarget(req: Request, res: Response): Promise<void> {
    try {
      const user = req.context.getUser();
      let userId: string;
      if (user && user.role === "ADMIN" && req.body.userId) {
        userId = req.body.userId;
      } else {
        userId = req.context.getUserId();
      }

      // Accept both a single object and an array of targets
      // If the request body has a 'targets' array, use it; otherwise, treat the body as a single target object
      const targets = Array.isArray(req.body) ? req.body : [req.body];
      
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
        "weekNumber",
      ];
      const results: any[] = [];
      const errors: any[] = [];

      for (const target of targets) {
        const { startDate, endDate, queryType, ...targetData } = target;
        if (!startDate || !queryType) {
          // errors.push({ error: "startDate and queryType are required for each target (monthly or yearly)" });
          continue;
        }
        
        const validTypes = ["monthly", "yearly"];
        // if (!validTypes.includes(queryType as string)) {
          // errors.push({ error: "queryType must be one of: monthly, yearly" });
          // continue;
        // }
        // const date = new Date(startDate);
        // const parsedStartDate = date.toISOString().slice(0, 19).replace('T', ' ');

        const filteredTargetData: any = {};
        for (const key of allowedFields) {
          if (key in targetData) {
            filteredTargetData[key] = targetData[key];
          }
        }
        
        try {
          // Handles both monthly and yearly upserts based on queryType
          const result = await this.service.upsertTargetByPeriod(
            userId,
            startDate,
            endDate,
            queryType,
            filteredTargetData
          );   
        results.push(result);
        } catch (err) {
          // errors.push({ error: err instanceof Error ? err.message : err });
        }
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: results,
        errors,
      });
    } catch (error) {
      console.error("Error in upsertTarget (monthly/yearly):", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async getTargets(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, queryType } = req.query;
      const userIdRaw = req.query.userId;
      const userId =
        typeof userIdRaw === "string"
          ? userIdRaw
          : Array.isArray(userIdRaw)
          ? userIdRaw[0]
          : "";

      // Ensure startDate and endDate are strings
      const startDateStr =
        typeof startDate === "string"
          ? startDate
          : Array.isArray(startDate)
          ? startDate[0]
          : "";
      const endDateStr =
        typeof endDate === "string"
          ? endDate
          : Array.isArray(endDate)
          ? endDate[0]
          : "";

      if (typeof userId !== "string") {
        utils.sendErrorResponse(res, "Invalid userId");
        return;
      }

      if (!startDateStr || !queryType) {
        utils.sendErrorResponse(
          res,
          "startDate and type are required query parameters"
        );
        return;
      }

      const validTypes = ["weekly", "monthly", "yearly"];
      if (!validTypes.includes(queryType as string)) {
        utils.sendErrorResponse(
          res,
          "type must be one of: weekly, monthly, yearly"
        );
        return;
      }

      let results;
      switch (queryType) {
        case "weekly":
          results = await this.service.getWeeklyTarget(
            userId as string,
            startDateStr as string,
            endDate as string
          );
          break;
        case "monthly":
          results = await this.service.getAggregatedMonthlyTarget(
            userId as string,
            startDateStr as string,
            endDateStr as string,
            "monthly"
          );
          break;
        case "yearly":
          if (!startDateStr) {
            utils.sendErrorResponse(
              res,
              "startDate is required for yearly query"
            );
            return;
          }
          results = await this.service.getAggregatedYearlyTarget(
            userId,
            startDate as string,
            endDate as string,
            "yearly"
          );
          break;
      }

      utils.sendSuccessResponse(res, 200, { success: true, data: results });
    } catch (error) {
      console.error("Error in getTargets:", error);
      utils.sendErrorResponse(res, error);
    }
  }
}
