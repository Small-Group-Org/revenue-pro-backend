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
    this.debugTargets = this.debugTargets.bind(this);
  }

  async upsertTarget(req: Request, res: Response): Promise<void> {
    try {
      console.log("=== Upsert Target Request ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      
      const user = req.context.getUser();
      let userId: string;
      if (user && user.role === "ADMIN" && req.body.userId) {
        userId = req.body.userId;
      } else {
        userId = req.context.getUserId();
      }
      
      console.log("User ID:", userId);
      console.log("User role:", user?.role);

      // Accept both a single object and an array of targets
      // If the request body has a 'targets' array, use it; otherwise, treat the body as a single target object
      const targets = Array.isArray(req.body) ? req.body : [req.body];
      console.log("Number of targets to process:", targets.length);
      
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

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        console.log(`Processing target ${i + 1}/${targets.length}:`, target);
        
        const { startDate, endDate, queryType, ...targetData } = target;
        if (!startDate || !queryType) {
          console.log(`Skipping target ${i + 1}: missing startDate or queryType`);
          continue;
        }
        
        console.log(`Processing target: ${startDate} to ${endDate}, queryType: ${queryType}`);
        
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
        
        console.log(`Filtered target data:`, filteredTargetData);
        
        try {
          // Handles both monthly and yearly upserts based on queryType
          const result = await this.service.upsertTargetByPeriod(
            userId,
            startDate,
            endDate,
            queryType,
            filteredTargetData
          );   
          
          console.log(`Result type: ${Array.isArray(result) ? 'array' : 'single'}, length: ${Array.isArray(result) ? result.length : 1}`);
          
          // Handle case where result might be an array (for yearly queryType)
          if (Array.isArray(result)) {
            results.push(...result);
          } else {
            results.push(result);
          }
        } catch (err) {
          console.error(`Error processing target ${i + 1}:`, err);
          errors.push({ 
            targetIndex: i, 
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
          });
        }
      }

      console.log(`Processing complete. Results: ${results.length}, Errors: ${errors.length}`);

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: results,
        errors,
      });
    } catch (error) {
      console.error("Error in upsertTarget (monthly/yearly):", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      utils.sendErrorResponse(res, error);
    }
  }

  async debugTargets(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;
      const userIdStr = typeof userId === "string" ? userId : Array.isArray(userId) ? userId[0] : "";
      
      if (!userIdStr) {
        utils.sendErrorResponse(res, "userId is required");
        return;
      }
      
      const debugResult = await this.service.debugTargetsInDatabase(userIdStr as string);
      utils.sendSuccessResponse(res, 200, { success: true, data: debugResult });
    } catch (error) {
      console.error("Error in debugTargets:", error);
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

      // Ensure startDate, endDate, and queryType are strings
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
      const queryTypeStr =
        typeof queryType === "string"
          ? queryType
          : Array.isArray(queryType)
          ? queryType[0]
          : "";

      if (typeof userId !== "string") {
        utils.sendErrorResponse(res, "Invalid userId");
        return;
      }

      if (!startDateStr || !queryTypeStr) {
        utils.sendErrorResponse(
          res,
          "startDate and type are required query parameters"
        );
        return;
      }

      const validTypes = ["weekly", "monthly", "yearly"];
      if (!validTypes.includes(queryTypeStr as string)) {
        utils.sendErrorResponse(
          res,
          "type must be one of: weekly, monthly, yearly"
        );
        return;
      }

      let results;
      switch (queryTypeStr) {
        case "weekly":
          results = await this.service.getWeeklyTargetsInRange(
            userId as string,
            startDateStr as string,
            endDateStr as string,
            queryTypeStr
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
          if (!endDateStr) {
            utils.sendErrorResponse(
              res,
              "endDate is required for yearly query"
            );
            return;
          }
          results = await this.service.getAggregatedYearlyTarget(
            userId,
            startDateStr,
            endDateStr,
            queryTypeStr as string
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
