import { Request, Response } from "express";
import {
  LeadService,
  SheetProcessingResult,
} from "../services/leads/service/service.js";
import utils from "../utils/utils.js";
import conversionRateModel, {
  IConversionRate,
} from "../services/leads/repository/models/conversionRate.model.js";
import { conversionRateRepository } from "../services/leads/repository/repository.js";
import { sanitizeLeadData } from "../services/leads/utils/leads.util.js";

export class LeadController {
  /**
   * Endpoint to update conversion rates and lead scores for all clients
   * POST /leads/update-cr-all
   */
  async updateConversionRatesAndLeadScores(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      let clientIds: string[] = [];

      if (req.query.clientId) {
        if (req.query.clientId === "all") {
          // All clients
          clientIds = await this.service.getAllClientIds();
          if (!clientIds || clientIds.length === 0) {
            utils.sendErrorResponse(res, "No clientIds found in leads collection");
            return;
          }
        } else {
          // Specific client
          clientIds = [String(req.query.clientId)];
        }
      } else {
        utils.sendErrorResponse(res, "clientId is required (use ?clientId=all or a specific id)");
        return;
      }

      if (!clientIds || clientIds.length === 0) {
        utils.sendErrorResponse(res, "No clientIds found in leads collection");
        return;
      }

      const results = [];
      for (const clientId of clientIds) {
        try {
          console.log(`[API] Processing clientId: ${clientId}`);
          const result =
            await this.service.updateConversionRatesAndLeadScoresForClient(
              clientId
            );
          const updatedLeads = await this.service.getLeads(clientId);

          results.push({
            clientId,
            processing: {
              totalLeads: updatedLeads.length,
              updatedLeads: result.updatedLeads,
              updatedConversionRates: result.updatedConversionRates,
              errors: result.errors,
            },
            summary: {
              processingSuccessRate:
                updatedLeads.length > 0
                  ? `${(
                      (result.updatedLeads / updatedLeads.length) *
                      100
                    ).toFixed(1)}%`
                  : "0%",
              updatedLeads: result.updatedLeads,
              updatedConversionRates: result.updatedConversionRates,
            },
          });
        } catch (err: any) {
          results.push({
            clientId,
            error: err.message || "Unknown error",
          });
        }
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        processedClients: clientIds.length,
        results,
      });
    } catch (error) {
      console.error(
        "Error in updateConversionRatesAndLeadScores endpoint:",
        error
      );
      utils.sendErrorResponse(res, error);
    }
  }
  private service: LeadService;

  constructor() {
    this.service = new LeadService();

    this.createLead = this.createLead.bind(this);
    this.updateLead = this.updateLead.bind(this);
    this.processSheetLeads = this.processSheetLeads.bind(this);
    this.getConversionRates = this.getConversionRates.bind(this);
    this.updateConversionRatesAndLeadScores =
      this.updateConversionRatesAndLeadScores.bind(this);
    this.getLeadsPaginated = this.getLeadsPaginated.bind(this);
  }
  /**
   * Endpoint to fetch paginated, sortable, and filterable leads
   * GET /leads/paginated
   * Query params:
   *   clientId, startDate, endDate, page, limit, sortBy, sortOrder, service, adSetName, adName, status, unqualifiedLeadReason
   */
  async getLeadsPaginated(req: Request, res: Response): Promise<void> {
    try {
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const startDate =
        typeof req.query.startDate === "string"
          ? req.query.startDate
          : undefined;
      const endDate =
        typeof req.query.endDate === "string" ? req.query.endDate : undefined;

      // Pagination and sorting
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 50;
      const sortBy = req.query.sortBy === "score" ? "score" : "date";
      const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

      // Filters
      const filters: any = {};
      if (typeof req.query.service === "string")
        filters.service = req.query.service;
      if (typeof req.query.adSetName === "string")
        filters.adSetName = req.query.adSetName;
      if (typeof req.query.adName === "string")
        filters.adName = req.query.adName;
      if (typeof req.query.status === "string")
        filters.status = req.query.status;
      if (typeof req.query.unqualifiedLeadReason === "string")
        filters.unqualifiedLeadReason = req.query.unqualifiedLeadReason;

      // Fetch paginated leads
      const result = await this.service.getLeadsPaginated(
        clientId,
        startDate,
        endDate,
        { page, limit, sortBy, sortOrder },
        filters
      );

      // Fetch grouped conversion rates for frontend
      const conversionRates = await conversionRateRepository.getConversionRates(
        clientId ? { clientId } : {}
      );
      const crGrouped = {
        service: conversionRates
          .filter((cr) => cr.keyField === "service")
          .map((cr) => ({
            name: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        adSet: conversionRates
          .filter((cr) => cr.keyField === "adSetName")
          .map((cr) => ({
            name: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        adName: conversionRates
          .filter((cr) => cr.keyField === "adName")
          .map((cr) => ({
            name: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        dates: conversionRates
          .filter((cr) => cr.keyField === "leadDate")
          .map((cr) => ({
            date: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        zip: conversionRates
          .filter((cr) => cr.keyField === "zip")
          .map((cr) => ({
            zip: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
      };

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: result.leads,
        pagination: result.pagination,
        conversionRates: crGrouped,
      });
    } catch (error) {
      console.error("Error in getLeadsPaginated:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async getLeadFiltersAndCounts(req: Request, res: Response): Promise<void> {
    try {
      // Check if clientId is missing or empty
      if (!req.query.clientId) {
        utils.sendErrorResponse(res, {
          message: "clientId is required",
          statusCode: 400,
        });
        return;
      }
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const startDate =
        typeof req.query.startDate === "string"
          ? req.query.startDate
          : undefined;
      const endDate =
        typeof req.query.endDate === "string" ? req.query.endDate : undefined;

        // Additional validation to ensure clientId is a valid string after type checking
      if (!clientId) {
        utils.sendErrorResponse(res, {
          message: "clientId must be a valid string",
          statusCode: 400
        });
        return;
      }

      // Fetch conversion rates for dropdowns
      const data = await this.service.fetchLeadFiltersAndCounts(
        clientId,
        startDate,
        endDate
      );
      utils.sendSuccessResponse(res, 200, {
        success: true,
        data,
      });
    } catch (error) {
      console.error("Error in getLeadFilters:", error);
      utils.sendErrorResponse(res, error);
    }
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
      const conversionRates = await conversionRateRepository.getConversionRates(
        clientId ? { clientId } : {}
      );
  
      // Group conversion rates by field for response
      const crGrouped = {
        service: conversionRates
          .filter((cr) => cr.keyField === "service")
          .map((cr) => ({
            name: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        adSet: conversionRates
          .filter((cr) => cr.keyField === "adSetName")
          .map((cr) => ({
            name: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        adName: conversionRates
          .filter((cr) => cr.keyField === "adName")
          .map((cr) => ({
            name: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        dates: conversionRates
          .filter((cr) => cr.keyField === "leadDate")
          .map((cr) => ({
            date: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
        zip: conversionRates
          .filter((cr) => cr.keyField === "zip")
          .map((cr) => ({
            zip: cr.keyName,
            conversionRate: cr.conversionRate,
          })),
      };
  
      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: leads,
        conversionRates: crGrouped,
      });
    } catch (error) {
      console.error("Error in getLeads:", error);
      utils.sendErrorResponse(res, error);
    }
  }
  
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const { timeFilter = 'all' } = req.query;

      const analytics = await this.service.getLeadAnalytics(
      clientId as string, 
      timeFilter as any
    );
    res.json({
      success: true,
      data: analytics
    });
    } catch (error) {
      console.error("Error in getAnalytics", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async getAnalyticsTable(req: Request, res: Response): Promise<void> {
  try {
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const {
      commonTimeFilter = 'all',
      adSetPage = '1',
      adNamePage = '1',
      adSetItemsPerPage = '15',
      adNameItemsPerPage = '10',
      adSetSortField = 'estimateSet',
      adSetSortOrder = 'desc',
      adNameSortField = 'estimateSet',
      adNameSortOrder = 'desc',
      showTopRanked = 'false'
    } = req.query;

    const performanceData = await this.service.getPerformanceTables(
      clientId as string,
      commonTimeFilter as any,
      parseInt(adSetPage as string),
      parseInt(adNamePage as string),
      parseInt(adSetItemsPerPage as string),
      parseInt(adNameItemsPerPage as string),
      {
        adSetSortField: adSetSortField as any,
        adSetSortOrder: adSetSortOrder as any,
        adNameSortField: adNameSortField as any,
        adNameSortOrder: adNameSortOrder as any,
        showTopRanked: showTopRanked === 'true'
      }
    );

    res.json({
      success: true,
      data: performanceData
    });
  } catch (error) {
    console.error("Error in getAnalyticsTable", error);
    utils.sendErrorResponse(res, error);
  }
}

  async createLead(req: Request, res: Response): Promise<void> {
  try {
    const leadsPayload = Array.isArray(req.body) ? req.body : [req.body];
    const processedLeads = [];

    for (const rawPayload of leadsPayload) {
      const payload = sanitizeLeadData(rawPayload);

      // Default status
      if (!payload.status) {
        payload.status = "new";
      }

      // Validate status
      if (!["new", "in_progress", "estimate_set", "unqualified"].includes(payload.status)) {
        utils.sendErrorResponse(
          res,
          `Invalid status '${payload.status}'. Must be one of: new, in_progress, estimate_set, unqualified`
        );
        return;
      }

      // Clear unqualifiedLeadReason if not unqualified
      if (payload.status !== "unqualified") {
        payload.unqualifiedLeadReason = "";
      }

      // Initialize leadScore if missing
      if (!payload.leadScore) {
        payload.leadScore = 0;
      }

      // 🔑 Strict uniqueness filter
      const query = {
        clientId: payload.clientId,
        adSetName: payload.adSetName,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        service: payload.service,
        adName: payload.adName,
        zip: payload.zip,
      };


      const lead = await this.service.upsertLead(query, payload);
      processedLeads.push(lead);
    }

    utils.sendSuccessResponse(res, 201, {
      success: true,
      data: processedLeads.length === 1 ? processedLeads[0] : processedLeads,
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
      const { sheetUrl, clientId, uniquenessByPhoneEmail } = req.body;

      if (!sheetUrl || !clientId) {
        utils.sendErrorResponse(res, "sheetUrl and clientId are required");
        return;
      }

      console.log("Sheet processing started for client:", clientId);
      console.log("Uniqueness by phone/email enabled:", !!uniquenessByPhoneEmail);

      // Process the entire sheet with comprehensive statistics
      const { result: processingResult, conversionData } =
        await this.service.processCompleteSheet(sheetUrl, clientId, !!uniquenessByPhoneEmail);

      // Save conversion rates to database
      if (processingResult.conversionRatesGenerated > 0) {
        await conversionRateRepository.batchUpsertConversionRates(
          conversionData
        );

        // After processing new leads and updating conversion rates, recalculate lead scores
        console.log(
          `Recalculating lead scores for client ${clientId} after sheet processing`
        );
        try {
          const scoreResult = await this.service.recalculateAllLeadScores(
            clientId
          );
          console.log(
            `Updated ${scoreResult.updatedLeads} lead scores for client ${clientId}`
          );
        } catch (scoreError: any) {
          console.error(
            `Error updating lead scores after sheet processing:`,
            scoreError
          );
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
            skipReasons: processingResult.skipReasons,
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
            processingSuccessRate: `${(
              (processingResult.validLeadsProcessed /
                processingResult.totalRowsInSheet) *
              100
            ).toFixed(1)}%`,
            newVsDuplicates: `${processingResult.newLeadsAdded} new, ${processingResult.duplicatesUpdated} updated`,
          },
        },
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
