import { Request, Response } from "express";
import { LeadService, SheetProcessingResult } from "../services/leads/service/service.js";
import utils from "../utils/utils.js";
import conversionRateModel, {
  IConversionRate,
} from "../services/leads/repository/models/conversionRate.model.js";
import { conversionRateRepository } from "../services/leads/repository/repository.js";

export class LeadController {
  /**
   * Endpoint to update conversion rates and lead scores for all clients
   * POST /leads/update-cr-all
   */
  async updateConversionRatesAndLeadScores(req: Request, res: Response): Promise<void> {
    try {
      // Get all unique clientIds from leads collection
      
      const clientIds = await this.service.getAllClientIds();
      if (!clientIds || clientIds.length === 0) {
        utils.sendErrorResponse(res, "No clientIds found in leads collection");
        return;
      }

      const results = [];
      for (const clientId of clientIds) {
        try {
          console.log(`[API] Processing clientId: ${clientId}`);
          const result = await this.service.updateConversionRatesAndLeadScoresForClient(clientId);
          const updatedLeads = await this.service.getLeads(clientId);

          results.push({
            clientId,
            processing: {
              totalLeads: updatedLeads.length,
              updatedLeads: result.updatedLeads,
              updatedConversionRates: result.updatedConversionRates,
              errors: result.errors
            },
            summary: {
              processingSuccessRate: updatedLeads.length > 0 ? `${((result.updatedLeads / updatedLeads.length) * 100).toFixed(1)}%` : '0%',
              updatedLeads: result.updatedLeads,
              updatedConversionRates: result.updatedConversionRates
            }
          });
        } catch (err: any) {
          results.push({
            clientId,
            error: err.message || "Unknown error"
          });
        }
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        processedClients: clientIds.length,
        results
      });
    } catch (error) {
      console.error("Error in updateConversionRatesAndLeadScores endpoint:", error);
      utils.sendErrorResponse(res, error);
    }
  }
  private service: LeadService;

  constructor() {
    this.service = new LeadService();

    this.getLeads = this.getLeads.bind(this);
    this.createLead = this.createLead.bind(this);
    this.updateLead = this.updateLead.bind(this);
    this.processSheetLeads = this.processSheetLeads.bind(this);
    this.getConversionRates = this.getConversionRates.bind(this);
    this.updateConversionRatesAndLeadScores = this.updateConversionRatesAndLeadScores.bind(this)
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

      // Fetch leads
      const leads = await this.service.getLeads(clientId, startDate, endDate);

      // Fetch conversion rates for this client
      const conversionRates = await conversionRateRepository.getConversionRates(clientId ? { clientId } : {});

      // Group conversion rates by field for response
      const crGrouped = {
        service: conversionRates
          .filter(cr => cr.keyField === 'service')
          .map(cr => ({ name: cr.keyName, conversionRate: cr.conversionRate })),
        adSet: conversionRates
          .filter(cr => cr.keyField === 'adSetName')
          .map(cr => ({ name: cr.keyName, conversionRate: cr.conversionRate })),
        adName: conversionRates
          .filter(cr => cr.keyField === 'adName')
          .map(cr => ({ name: cr.keyName, conversionRate: cr.conversionRate })),
        dates: conversionRates
          .filter(cr => cr.keyField === 'leadDate')
          .map(cr => ({ date: cr.keyName, conversionRate: cr.conversionRate })),
        zip: conversionRates
          .filter(cr => cr.keyField === 'zip')
          .map(cr => ({ zip: cr.keyName, conversionRate: cr.conversionRate })),
      };

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: leads,
        conversionRates: crGrouped
      });
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

        // Initialize leadScore as 0 for new leads (will be calculated on first getLeads call)
        payload.leadScore = 0;

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


  async processSheetLeads(req: Request, res: Response): Promise<void> {
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
        
        // After processing new leads and updating conversion rates, recalculate lead scores
        console.log(`Recalculating lead scores for client ${clientId} after sheet processing`);
        try {
          const scoreResult = await this.service.recalculateAllLeadScores(clientId);
          console.log(`Updated ${scoreResult.updatedLeads} lead scores for client ${clientId}`);
        } catch (scoreError: any) {
          console.error(`Error updating lead scores after sheet processing:`, scoreError);
        }
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
            skipReasons: processingResult.skipReasons
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


}
