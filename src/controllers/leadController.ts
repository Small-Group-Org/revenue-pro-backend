import { Request, Response } from "express";
import { LeadService } from "../services/leads/service/service.js";
import utils from "../utils/utils.js";
import { ParsedQs } from "qs";
import conversionRateModel from "@/services/leads/repository/models/conversionRate.model.js";

export class LeadController {
  private service: LeadService;

  constructor() {
    this.service = new LeadService();

    this.getLeads = this.getLeads.bind(this);
    this.createLead = this.createLead.bind(this);
    this.updateLead = this.updateLead.bind(this);
    this.fetchSheetAndUpdateConversion = this.fetchSheetAndUpdateConversion.bind(this);
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

      for (const payload of leadsPayload) {
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
      const { _id, estimateSet, unqualifiedLeadReason } = req.body;

      if (!_id) {
        utils.sendErrorResponse(res, "_id is required for update");
        return;
      }

      const updatedLead = await this.service.updateLead(_id, {
        estimateSet,
        unqualifiedLeadReason,
      });

      utils.sendSuccessResponse(res, 200, { success: true, data: updatedLead });
    } catch (error) {
      console.error("Error in updateLead:", error);
      utils.sendErrorResponse(res, error);
    }
  }

  async fetchSheetAndUpdateConversion(req: Request, res: Response): Promise<void> {
    try {
      const { sheetUrl, clientId } = req.body;

      if (!sheetUrl || !clientId) {
        utils.sendErrorResponse(res, "sheetUrl and clientId are required");
        return;
      }

      console.log("lead fetching started");
      
      // 1️⃣ Fetch leads from the Google Sheet
      const leads = await this.service.fetchLeadsFromSheet(sheetUrl, clientId);

      console.log("leads fetched");
      
      // 2 Process leads to calculate conversion rates
      const conversionData = await this.service.processLeads(leads, clientId);

      // 3 Upsert conversion rates in DB
      for (const item of conversionData) {
        await conversionRateModel.findOneAndUpdate(
          { clientId: item.clientId, keyField: item.keyField, keyName: item.keyName },
          item,
          { new: true, upsert: true }
        ).exec();
      }

      utils.sendSuccessResponse(res, 200, {
        success: true,
        message: "Leads processed and conversion rates updated successfully",
        data: conversionData,
      });
    } catch (error) {
      console.error("Error in fetchSheetAndUpdateConversion:", error);
      utils.sendErrorResponse(res, error);
    }
  }
}

