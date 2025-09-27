import { Request, Response } from "express";
import { CombinedLeadService } from "../services/leads/service/index.js";
import { SheetsService } from "../services/leads/service/sheets.service.js";
import utils from "../utils/utils.js";
import { TimezoneUtils } from "../utils/timezoneUtils.js";
import { conversionRateRepository } from "../services/leads/repository/index.js";
import { sanitizeLeadData } from "../services/leads/utils/leads.util.js";
import mongoose from "mongoose";

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
    // ✅ All clients with lead data
    clientIds = await this.service.getAllClientIds();
    if (!clientIds || clientIds.length === 0) {
      utils.sendErrorResponse(
        res,
        "No clients with associated lead data were found."
      );
      return;
    }
  } else {
    // ✅ Specific client
    const clientId = String(req.query.clientId);

    // Step 1: Validate client exists in UserModel
    // Step 1: Validate client exists in UserModel
    const clientExists = await this.service.doesUserExist(clientId);
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      utils.sendErrorResponse(res, "Invalid clientId format.");
      return;
    }
    if (!clientExists) {
      utils.sendErrorResponse(
        res,
        `No user found for clientId: ${clientId}.`
      );
      return;
    }

    // Step 2: Validate client has lead data
    const hasLeadData = await this.service.hasLeadData(clientId);
    if (!hasLeadData) {
      utils.sendErrorResponse(
        res,
        `No leads found for clientId: ${clientId}.`
      );
      return;
    }

    clientIds = [clientId];

  }
} else {
  utils.sendErrorResponse(
    res,
    `Required clientId parameter is missing`
  );
  return;
}


    const results = [];
    for (const clientId of clientIds) {
      try {
        const result =
          await this.service.updateConversionRatesAndLeadScoresForClient(
            clientId
          );

        results.push({
          clientId,
          processing: {
            totalLeads: result.totalProcessedLeads,
            updatedLeads: result.updatedLeads,
            updatedConversionRates: result.updatedConversionRates,
            errors: result.errors,
          },
          summary: {
            processingSuccessRate:
              result.totalProcessedLeads > 0
                ? `${(
                    (result.updatedLeads / result.totalProcessedLeads) *
                    100
                  ).toFixed(1)}%`
                : "0%",
            updatedLeads: result.updatedLeads,
            totalProcessedLeads: result.totalProcessedLeads,
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


  private service: CombinedLeadService;

  constructor() {
    this.service = new CombinedLeadService();

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
      const userTimeZoneHeader = req.header('X-Timezone');
      const timezone = TimezoneUtils.extractTimeZoneFromHeader(userTimeZoneHeader);
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
        filters.service = req.query.service.trim();
      if (typeof req.query.adSetName === "string")
        filters.adSetName = req.query.adSetName.trim();
      if (typeof req.query.adName === "string")
        filters.adName = req.query.adName.trim();
      if (typeof req.query.status === "string")
        filters.status = req.query.status.trim();
      if (typeof req.query.unqualifiedLeadReason === "string")
        filters.unqualifiedLeadReason = req.query.unqualifiedLeadReason.trim();

      // Fetch paginated leads
      const result = await this.service.getLeadsPaginated(
        clientId,
        startDate,
        endDate,
        { page, limit, sortBy, sortOrder },
        filters,
        timezone
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
      const userTimeZoneHeader = req.header('X-Timezone');
      const timezone = TimezoneUtils.extractTimeZoneFromHeader(userTimeZoneHeader);
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
        endDate,
        timezone
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
  
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const clientId =
        typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const { timeFilter = 'all' } = req.query;
      const userTimeZoneHeader = req.header('X-Timezone');
      const timezone = TimezoneUtils.extractTimeZoneFromHeader(userTimeZoneHeader);

      const analytics = await this.service.getLeadAnalytics(
      clientId as string, 
      timeFilter as any,
      timezone
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

    const userTimeZoneHeader = req.header('X-Timezone');
    const timezone = TimezoneUtils.extractTimeZoneFromHeader(userTimeZoneHeader);

    const performanceData = await this.service.getPerformanceTables(
      clientId as string,
      commonTimeFilter as any,
      timezone,
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
      // Parse and convert leadDate from CST to UTC before sanitization
      if (rawPayload.leadDate) {
        const parsedDate = utils.parseDate(rawPayload.leadDate);
        if (!parsedDate) {
          utils.sendErrorResponse(
            res,
            `Invalid leadDate format: ${rawPayload.leadDate}. Expected formats: YYYY-MM-DD, MM/DD/YYYY, etc.`
          );
          return;
        }
        rawPayload.leadDate = parsedDate; // Now contains UTC ISO string
      }
      
      const payload = sanitizeLeadData(rawPayload);

      // Default status
      if (!payload.status) {
        payload.status = "new";
      }

      payload.isDeleted = false;
      payload.deletedAt = null;

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

  async deleteLead(req: Request, res: Response): Promise<void>{
    try {
      const ids = Array.isArray(req.body.leadIds) ? req.body.leadIds : [req.body.leadIds];

      if (!ids || ids.length === 0) {
      utils.sendErrorResponse(res, "Required leadId missing");
      return;
      }

      const deletedResult = await this.service.deleteLeads(ids);

      const message =
      deletedResult.deletedCount > 0
        ? `${deletedResult.deletedCount} lead(s) have been deleted successfully!`
        : "No lead deleted for given leadId(s)";

      utils.sendSuccessResponse(res, 200, {success: true, data: deletedResult, info: message});
    } catch (error) {
      console.error("Error in lead(s) deletion:", error);
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

      // Process the entire sheet with comprehensive statistics
      const sheetsService = new SheetsService();
      const { result: processingResult, conversionData } =
        await sheetsService.processCompleteSheet(
          sheetUrl, 
          clientId, 
          !!uniquenessByPhoneEmail,
          this.service.bulkCreateLeads.bind(this.service),
          this.service.processLeads.bind(this.service),
          this.service.getAllLeadsForClient.bind(this.service)
        );

      // Save conversion rates to database
      if (processingResult.conversionRatesGenerated > 0) {
        await conversionRateRepository.batchUpsertConversionRates(
          conversionData
        );

        // After processing new leads and updating conversion rates, recalculate lead scores
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
