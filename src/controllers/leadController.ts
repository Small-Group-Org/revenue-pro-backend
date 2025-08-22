import { Request, Response } from "express";
import { LeadService, SheetProcessingResult } from "../services/leads/service/service.js";
import utils from "../utils/utils.js";
import conversionRateUpdateService from "../services/cron/conversionRateUpdateService.js";
import conversionRateModel, {
  IConversionRate,
} from "../services/leads/repository/models/conversionRate.model.js";
import { conversionRateRepository } from "../services/leads/repository/repository.js";

export class LeadController {
  private service: LeadService;

  constructor() {
    this.service = new LeadService();

    this.getLeads = this.getLeads.bind(this);
    this.createLead = this.createLead.bind(this);
    this.updateLead = this.updateLead.bind(this);
    this.processSheetLeads =
      this.processSheetLeads.bind(this);
    this.getConversionRates = this.getConversionRates.bind(this);
    this.conditionalUpsertConversionRates =
      this.conditionalUpsertConversionRates.bind(this);
    this.triggerWeeklyConversionRateUpdate =
      this.triggerWeeklyConversionRateUpdate.bind(this);
    this.getWeeklyUpdateStatus = this.getWeeklyUpdateStatus.bind(this);
  }

  async getLeads(req: Request, res: Response): Promise<void> {
    try {
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;

      const startDate =
        typeof req.query.startDate === "string"
          ? req.query.startDate
          : undefined;

      const endDate =
        typeof req.query.endDate === "string" ? req.query.endDate : undefined;

      const leads = await this.service.getLeads(clientId, startDate, endDate);

      utils.sendSuccessResponse(res, 200, { success: true, data: leads });
    } catch (error) {
      console.error("Error in getLeads:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async createLead(req: Request, res: Response): Promise<void> {
    try {
      // Support bulk creation if req.body is array, else single object
      const leadsPayload = Array.isArray(req.body) ? req.body : [req.body];
      const createdLeads = [];

      // Validate each lead payload
      for (const payload of leadsPayload) {
        // Set default status if not provided
        if (!payload.status) {
          payload.status = "new";
        }

        // Validate status
        if (
          !["new", "in_progress", "estimate_set", "unqualified"].includes(
            payload.status
          )
        ) {
          utils.sendErrorResponse(
            res,
            `Invalid status '${payload.status}'. Must be one of: new, in_progress, estimate_set, unqualified`
          );
          return;
        }

        // Clear unqualifiedLeadReason if status is not "unqualified"
        if (payload.status !== "unqualified") {
          payload.unqualifiedLeadReason = "";
        }

        const lead = await this.service.createLead(payload);
        createdLeads.push(lead);
      }

      utils.sendSuccessResponse(res, 201, {
        success: true,
        data: createdLeads.length === 1 ? createdLeads[0] : createdLeads,
      });
    } catch (error) {
      console.error("Error in createLead:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async updateLead(req: Request, res: Response): Promise<void> {
    try {
      const { _id, status, unqualifiedLeadReason } = req.body;

      if (!_id) {
        utils.sendErrorResponse(res, "_id is required for update");
        return;
      }

      // Validate status if provided
      if (
        status &&
        !["new", "in_progress", "estimate_set", "unqualified"].includes(status)
      ) {
        utils.sendErrorResponse(
          res,
          "Invalid status. Must be one of: new, in_progress, estimate_set, unqualified"
        );
        return;
      }

      const updatedLead = await this.service.updateLead(_id, {
        status,
        unqualifiedLeadReason,
      });

      utils.sendSuccessResponse(res, 200, { success: true, data: updatedLead });
    } catch (error) {
      console.error("Error in updateLead:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async processSheetLeads(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { sheetUrl, clientId } = req.body;

      if (!sheetUrl || !clientId) {
        utils.sendErrorResponse(res, "sheetUrl and clientId are required");
        return;
      }

      console.log("Sheet processing started for client:", clientId);

      // Process the entire sheet with comprehensive statistics
      const { result: processingResult, conversionData } = await this.service.processCompleteSheet(sheetUrl, clientId);

      // Save conversion rates to database
      if (processingResult.conversionRatesGenerated > 0) {
        await conversionRateRepository.batchUpsertConversionRates(conversionData);
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Sheet processed successfully",
        data: {
          processedSubSheet: processingResult.processedSubSheet,
          processing: {
            totalRowsInSheet: processingResult.totalRowsInSheet,
            validLeadsProcessed: processingResult.validLeadsProcessed,
            skippedRows: processingResult.skippedRows,
          },
          database: {
            leadsStoredInDB: processingResult.leadsStoredInDB,
            newLeadsAdded: processingResult.newLeadsAdded,
            duplicatesUpdated: processingResult.duplicatesUpdated,
          },
          conversionRates: {
            conversionRatesGenerated: processingResult.conversionRatesGenerated,
            insights: processingResult.conversionRateInsights,
          },
          summary: {
            processingSuccessRate: `${((processingResult.validLeadsProcessed / processingResult.totalRowsInSheet) * 100).toFixed(1)}%`,
            newVsDuplicates: `${processingResult.newLeadsAdded} new, ${processingResult.duplicatesUpdated} updated`
          }
        }
      });
    } catch (error) {
      console.error("Error in processSheetLeads:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async getConversionRates(req: Request, res: Response) {
    try {
      const clientId = req.query.clientId as string | undefined;

      // Optional filter by clientId
      const filter = clientId ? { clientId } : {};

      const conversionRates = await conversionRateRepository.getConversionRates(
        filter
      );

      return res.status(200).json({
        success: true,
        data: conversionRates,
      });
    } catch (error: any) {
      console.error("Error fetching conversion rates:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch conversion rates",
      });
    }
  }

  async conditionalUpsertConversionRates(req: Request, res: Response) {
    try {
      const data: IConversionRate[] = req.body;
      console.log("conversion rate", data);

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Request body must be a non-empty array of conversion rate objects",
        });
      }

      // Use batch upsert for better performance instead of individual upserts
      const results = await conversionRateRepository.batchUpsertConversionRates(
        data
      );

      return res.status(200).json({
        success: true,
        message: `${results.length} conversion rate(s) batch upserted (inserted/updated)`,
        data: results,
      });
    } catch (error: any) {
      console.error("Error in batch upsert:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to batch upsert conversion rates",
      });
    }
  }

  /**
   * Manual trigger for weekly conversion rate update (for testing)
   */
  async triggerWeeklyConversionRateUpdate(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      if (conversionRateUpdateService.isUpdateRunning()) {
        utils.sendErrorResponse(
          res,
          "Weekly conversion rate update is already running"
        );
        return;
      }

      const result = await conversionRateUpdateService.triggerManualUpdate();

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Weekly conversion rate update completed",
        data: result,
      });
    } catch (error: any) {
      console.error("Error in manual weekly update trigger:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  /**
   * Get status of weekly conversion rate update process
   */
  async getWeeklyUpdateStatus(req: Request, res: Response): Promise<void> {
    try {
      const isRunning = conversionRateUpdateService.isUpdateRunning();

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: {
          isRunning,
          message: isRunning
            ? "Weekly update is currently running"
            : "Weekly update is not running",
        },
      });
    } catch (error: any) {
      console.error("Error getting weekly update status:", error);
      utils.sendErrorResponse(res, error);
    }
  }
}
