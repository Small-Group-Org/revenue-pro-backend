import { Request, Response } from 'express';
import { ActualService } from '../services/actual/service/service.js';

export class ActualController {
  private actualService: ActualService;

  constructor() {
    this.actualService = new ActualService();
    this.upsertActual = this.upsertActual.bind(this);
    this.getActuals = this.getActuals.bind(this);
    this.getActualAndTargetReport = this.getActualAndTargetReport.bind(this);
    this.updateWeeklyReporting = this.updateWeeklyReporting.bind(this);
  }
  /**
   * Get both actual and target data for a given period and user.
   * Expects: userId, startDate, endDate, queryType (weekly/monthly/yearly) as query params.
   * Returns: { actual: [...], target: [...] }
   */
  async getActualAndTargetReport(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, queryType } = req.query;
      const userIdRaw = req.query.userId;
      const userId =
        typeof userIdRaw === "string"
          ? userIdRaw
          : Array.isArray(userIdRaw)
          ? userIdRaw[0]
          : "";

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

      if (!userId || !startDateStr || !endDateStr || !queryType) {
        res.status(400).json({ success: false, message: "userId, startDate, endDate, and queryType are required query parameters" });
        return;
      }

      // Get actuals (reuse logic from getActuals)
      let actualResults;
      const start = new Date(String(startDateStr));
      const end = new Date(String(endDateStr));
      const isFullYear =
        start.getMonth() === 0 &&
        start.getDate() === 1 &&
        end.getMonth() === 11 &&
        (end.getDate() === 31 || (end.getMonth() === 11 && new Date(end.getFullYear(), 11, 31).getDate() === end.getDate())) &&
        start.getFullYear() === end.getFullYear();

      if (isFullYear) {
        actualResults = await this.actualService.getActualYearlyMonthlyAggregate(
          String(userId),
          start.getFullYear()
        );
      } else {
        actualResults = await this.actualService.getActualsByDateRange(
          String(userId),
          String(startDateStr),
          String(endDateStr)
        );
      }

      // Get target data by calling TargetController's getTargets logic directly via service
      // Import TargetService at the top if not already
      const { TargetService } = await import("../services/target/service/service.js");
      const targetService = new TargetService();
      let targetResults: any[] = [];
      switch (queryType) {
        case "weekly":
          const weeklyTarget = await targetService.getWeeklyTarget(
            String(userId),
            String(startDateStr),
          );
          targetResults = [weeklyTarget];
          break;
        case "monthly":
          targetResults = await targetService.getAggregatedMonthlyTarget(
            String(userId),
            String(startDateStr),
            String(endDateStr),
            "monthly"
          );
          break;
        case "yearly":
          targetResults = await targetService.getAggregatedYearlyTarget(
            String(userId),
            String(startDateStr),
            String(endDateStr),
            "yearly"
          );
          break;
        default:
          targetResults = [];
      }

      res.status(200).json({
        success: true,
        data: {
          actual: actualResults,
          target: targetResults
        }
      });
    } catch (error: any) {
      console.error("Error in getActualAndTargetReport:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Upsert actual data for a single week. Always returns an array of 1 object.
   */
  async upsertActual(req: Request, res: Response): Promise<void> {
    try {
      const user = req.context?.getUser?.();
      let userId: string;
      if (user && user.role === "ADMIN" && req.body.userId) {
        userId = req.body.userId;
      } else {
        userId = req.context?.getUserId?.();
      }

      // Only allow upsert for a single week
      const { startDate, endDate, ...actualData } = req.body;
      if (!startDate) {
        res.status(400).json({ success: false, message: "startDate is required" });
        return;
      }

      // Upsert the actual for the week
      const upserted = await this.actualService.upsertActualWeekly(
        userId,
        startDate,
        endDate,
        actualData
      );

      // Always return as array for consistency
      res.status(200).json({ success: true, data: [upserted.toObject ? upserted.toObject() : upserted] });
    } catch (error: any) {
      console.error("Error in upsertActual (weekly):", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get actuals for week, month, or year. Always returns an array of objects.
   * If the date range matches a full year, return 12 monthly aggregates.
   */
  async getActuals(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      const userIdRaw = req.query.userId;
      const userId =
        typeof userIdRaw === "string"
          ? userIdRaw
          : Array.isArray(userIdRaw)
          ? userIdRaw[0]
          : "";

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

      if (!userId || !startDateStr || !endDateStr) {
        res.status(400).json({ success: false, message: "userId, startDate, and endDate are required query parameters" });
        return;
      }

      // Detect if the range is a full year (e.g., 2025-01-01 to 2025-12-31)
      const start = new Date(String(startDateStr));
      const end = new Date(String(endDateStr));
      const isFullYear =
        start.getMonth() === 0 &&
        start.getDate() === 1 &&
        end.getMonth() === 11 &&
        (end.getDate() === 31 || (end.getMonth() === 11 && new Date(end.getFullYear(), 11, 31).getDate() === end.getDate())) &&
        start.getFullYear() === end.getFullYear();

      let results;
      if (isFullYear) {
        results = await this.actualService.getActualYearlyMonthlyAggregate(
          String(userId),
          start.getFullYear()
        );
      } else {
        results = await this.actualService.getActualsByDateRange(
          String(userId),
          String(startDateStr),
          String(endDateStr)
        );
      }
      res.status(200).json({ success: true, data: results });
    } catch (error: any) {
      console.error("Error in getActuals:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update weekly reporting data
   * PATCH /api/v1/report/weekly-reporting
   * Body: { userId, startDate, revenue?, leads?, estimateRan?, estimateSet?, jobBooked? }
   */
  async updateWeeklyReporting(req: Request, res: Response): Promise<void> {
    try {
      const { userId, startDate, revenue, leads, estimateRan, estimateSet, jobBooked } = req.body;

      // Validate required fields
      if (!userId || !startDate) {
        res.status(400).json({ success: false, message: "userId and startDate are required" });
        return;
      }

      // Validate startDate format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate)) {
        res.status(400).json({ success: false, message: "startDate must be in YYYY-MM-DD format" });
        return;
      }

      // Build update data object (only include provided fields)
      // Map API field names to database field names
      const updateData: {
        revenue?: number;
        leads?: number;
        estimatesRan?: number;
        estimatesSet?: number;
        sales?: number;
      } = {};

      if (revenue !== undefined) updateData.revenue = Number(revenue);
      if (leads !== undefined) updateData.leads = Number(leads);
      if (estimateRan !== undefined) updateData.estimatesRan = Number(estimateRan);
      if (estimateSet !== undefined) updateData.estimatesSet = Number(estimateSet);
      if (jobBooked !== undefined) updateData.sales = Number(jobBooked);

      // Check if at least one field is provided
      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ success: false, message: "At least one field (revenue, leads, estimateRan, estimateSet, jobBooked) must be provided" });
        return;
      }

      const updated = await this.actualService.updateWeeklyReporting(
        userId,
        startDate,
        updateData
      );

      res.status(200).json({
        success: true,
        message: "Weekly reporting data updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("Error updating weekly reporting:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}