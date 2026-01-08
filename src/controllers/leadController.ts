import { Request, Response } from "express";
import { CombinedLeadService } from "../services/leads/service/index.js";
import { SheetsService } from "../services/leads/service/sheets.service.js";
import utils from "../utils/utils.js";
import { conversionRateRepository } from "../services/leads/repository/index.js";
import { sanitizeLeadData } from "../services/leads/utils/leads.util.js";
import mongoose from "mongoose";

export class LeadController {
  /**
   * Endpoint to update conversion rates and lead scores for all clients
   * POST /leads/update-cr-all
   */
  async processLeadScoresAndCRs(
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
          await this.service.processLeadScoresAndCRsByClientId(
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
      "Error in processLeadScoresAndCRs endpoint:",
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
    this.processLeadScoresAndCRs =
      this.processLeadScoresAndCRs.bind(this);
    this.getLeadsPaginated = this.getLeadsPaginated.bind(this);
    this.hubspotSubscription = this.hubspotSubscription.bind(this);
    this.updateLeadByEmail = this.updateLeadByEmail.bind(this);
    this.syncClientActivity = this.syncClientActivity.bind(this);
  }

  /**
   * Update a lead's status by email and clientId, using leadDate to disambiguate if multiple matches
   * PATCH /hooks/update-lead
   */
  async updateLeadByEmail(req: Request, res: Response): Promise<void> {
    const { leadDate, email, clientId, status, unqualifiedLeadReason, proposalAmount, jobBookedAmount } = req.body;

    // Validate required fields
    if (!email || !clientId || !status) {
      utils.sendErrorResponse(res, {
        message: "email, clientId, and status are required",
        statusCode: 400
      });
      return;
    }

    // Validate status
    const validStatuses = ["new", "in_progress", "estimate_set", "virtual_quote", "estimate_canceled", "proposal_presented", "job_booked", "job_lost", "estimate_rescheduled", "unqualified"];
    if (!validStatuses.includes(status)) {
      utils.sendErrorResponse(res, {
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        statusCode: 400
      });
      return;
    }
    // Validate proposalAmount if provided
    if (proposalAmount !== undefined && proposalAmount !== null) {
      const amount = Number(proposalAmount);
      if (isNaN(amount) || amount < 0) {
        utils.sendErrorResponse(res, {
          message: "proposalAmount must be a valid non-negative number",
          statusCode: 400
        });
        return;
      }
    }

    // Validate jobBookedAmount if provided
    if (jobBookedAmount !== undefined && jobBookedAmount !== null) {
      const amount = Number(jobBookedAmount);
      if (isNaN(amount) || amount < 0) {
        utils.sendErrorResponse(res, {
          message: "jobBookedAmount must be a valid non-negative number",
          statusCode: 400
        });
        return;
      }
    }

    try {
      const updatedLead = await this.service.findAndUpdateLeadByEmail({
        email,
        clientId,
        status,
        unqualifiedLeadReason,
        proposalAmount: proposalAmount !== undefined ? Number(proposalAmount) : undefined,
        jobBookedAmount: jobBookedAmount !== undefined ? Number(jobBookedAmount) : undefined,
        leadDate
      });

      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: updatedLead
      });
    } catch (error: any) {
      console.error("Error in updateLeadByEmail:", error);
      
      // Map service errors to appropriate HTTP responses
      if (error.message.includes("No lead found")) {
        utils.sendErrorResponse(res, { message: error.message, statusCode: 404 });
      } else if (error.message.includes("Multiple leads found")) {
        utils.sendErrorResponse(res, { message: error.message, statusCode: 409 });
      } else {
        utils.sendErrorResponse(res, error);
      }
    }
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
        filters.service = req.query.service.trim();
      if (typeof req.query.adSetName === "string")
        filters.adSetName = req.query.adSetName.trim();
      if (typeof req.query.adName === "string")
        filters.adName = req.query.adName.trim();
      if (typeof req.query.status === "string")
        filters.status = req.query.status.trim();
      if (typeof req.query.unqualifiedLeadReason === "string")
        filters.unqualifiedLeadReason = req.query.unqualifiedLeadReason.trim();
      // Search 'name' query parameter across multiple fields
      if (typeof req.query.name === "string" && req.query.name.trim() !== "") {
        const searchTerm = req.query.name.trim();
        filters.$or = [
          { name: { $regex: searchTerm, $options: "i" } },
          { service: { $regex: searchTerm, $options: "i" } },
          { adSetName: { $regex: searchTerm, $options: "i" } },
          { adName: { $regex: searchTerm, $options: "i" } }
        ];
      }   
      // Fetch paginated leads
      const result = await this.service.getLeadsPaginated(
        clientId,
        startDate,
        endDate,
        { page, limit, sortBy, sortOrder },
        filters,
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
        endDate,
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
      const startDate =
        typeof req.query.startDate === "string" ? req.query.startDate : undefined;
      const endDate =
        typeof req.query.endDate === "string" ? req.query.endDate : undefined;
      const sort =
        typeof req.query.sort === "string" ? req.query.sort : undefined;

      const analytics = await this.service.getLeadAnalytics(
        clientId as string,
        startDate,
        endDate,
        sort
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
    const startDate =
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate =
      typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const adSetPage = req.query.adSetPage ? parseInt(req.query.adSetPage as string, 15) : 1;
    const adNamePage = req.query.adNamePage ? parseInt(req.query.adNamePage as string, 10) : 1;
    const adSetItemsPerPage = req.query.adSetItemsPerPage ? parseInt(req.query.adSetItemsPerPage as string, 10) : 15;
    const adNameItemsPerPage = req.query.adNameItemsPerPage ? parseInt(req.query.adNameItemsPerPage as string, 10) : 10;
    const adSetSortField = req.query.adSetSortField as 'adSetName' | 'total' | 'estimateSet' | 'percentage' | 'jobBookedAmount' | 'proposalAmount' | undefined;
    const adSetSortOrder = req.query.adSetSortOrder as 'asc' | 'desc' | undefined;
    const adNameSortField = req.query.adNameSortField as 'adName' | 'total' | 'estimateSet' | 'percentage' | 'jobBookedAmount' | 'proposalAmount' | undefined;
    const adNameSortOrder = req.query.adNameSortOrder as 'asc' | 'desc' | undefined;
    const showTopRanked = req.query.showTopRanked === 'true';

    const performanceData = await this.service.getPerformanceTables(
      clientId as string,
      startDate,
      endDate,
      adSetPage,
      adNamePage,
      adSetItemsPerPage,
      adNameItemsPerPage,
      {
        adSetSortField,
        adSetSortOrder,
        adNameSortField,
        adNameSortOrder,
        showTopRanked
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
      if (!["new", "in_progress", "estimate_set", "virtual_quote", "estimate_canceled", "proposal_presented", "job_booked", "job_lost", "estimate_rescheduled", "unqualified"].includes(payload.status)) {
        utils.sendErrorResponse(
          res,
          `Invalid status '${payload.status}'. Must be one of: new, in_progress, estimate_set, virtual_quote, estimate_canceled, proposal_presented, job_booked, job_lost, estimate_rescheduled, unqualified`
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
        email: payload.email,
        phone: payload.phone,
        service: payload.service,
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
      const { _id, status, unqualifiedLeadReason, proposalAmount, jobBookedAmount, notes } = req.body;

      if (!_id) {
        utils.sendErrorResponse(res, "_id is required for update");
        return;
      }

      // If Validate status is provided
      if (status) {
        const validStatuses = ["new", "in_progress", "estimate_set", "virtual_quote", "estimate_canceled", "proposal_presented", "job_booked", "job_lost", "estimate_rescheduled", "unqualified"];
        if (!validStatuses.includes(status)) {
          utils.sendErrorResponse(
            res,
            `Invalid status. Must be one of: ${validStatuses.join(", ")}`
          );
          return;
        }
      }

      // Validate notes if provided
      if (notes !== undefined && typeof notes !== 'string') {
        utils.sendErrorResponse(res, "Notes must be a string");
        return;
      }

      if (notes !== undefined && notes.length > 2000) {
        utils.sendErrorResponse(res, "Notes cannot exceed 2000 characters");
        return;
      }

      const updateData = {
        status,
        unqualifiedLeadReason,
        proposalAmount,
        jobBookedAmount,
        notes
      };

      const updatedLead = await this.service.updateLead(_id, updateData);

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
          this.service.computeConversionRatesForClient.bind(this.service),
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

  async hubspotSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { propertyValue, propertyName, objectId } = req.body[0];

      // Validate required fields
      if (!propertyValue || !propertyName || !objectId) {
        utils.sendErrorResponse(res, {
          message: "propertyValue, propertyName, and objectId are required",
          statusCode: 400
        });
        return;
      }

      // Validate objectId format (HubSpot contact IDs are typically numeric)
      if (!/^\d+$/.test(objectId)) {
        utils.sendErrorResponse(res, {
          message: "objectId must be a numeric value (HubSpot contact ID)",
          statusCode: 400
        });
        return;
      }

      // HubSpot API token
      const token = "pat-na2-8d304536-4f6f-4d43-8e1d-6dd124fe6d77";
      
      // Make HubSpot API call to get contact details
      const hubspotUrl = `https://api.hubapi.com/crm/v3/objects/contacts/${objectId}`;
      console.log("Making HubSpot API call to:", hubspotUrl);
      
      const hubspotResponse = await fetch(hubspotUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!hubspotResponse.ok) {
        const errorText = await hubspotResponse.text();
        console.error("HubSpot API Error Details:", {
          status: hubspotResponse.status,
          statusText: hubspotResponse.statusText,
          url: hubspotUrl,
          objectId,
          responseBody: errorText
        });
      }

      const contactData = await hubspotResponse.json();
      
      // Console log the response as requested
      console.log("HubSpot API Response:", JSON.stringify(contactData, null, 2));

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Property data processed successfully",
        data: {
          propertyValue,
          propertyName,
          objectId,
          contactDetails: contactData
        }
      });
    } catch (error: any) {
      console.error("Error in processPropertyData:", error);
      utils.sendErrorResponse(res, error);
    }
  }
  async syncClientActivity(req: Request, res: Response): Promise<void> {
    try {

      // Get categorized inactive client activity data
      const categorizedClients = await this.service.getClientActivityData();


      utils.sendSuccessResponse(res, 200, {
        success: true,
        data: {
          disengagedUsersByLeads: categorizedClients.disengagedUsersByLeads,
          disengagedUsersByWeeklyReports: categorizedClients.disengagedUsersByWeeklyReports,
          disengagedUsersByBoth: categorizedClients.disengagedUsersByBoth,
        }
      });
    } catch (error: any) {
      console.error("Error in syncClientActivity:", error);
      utils.sendErrorResponse(res, error);
    }
  }

}
