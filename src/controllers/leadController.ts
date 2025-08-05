import { Request, Response } from "express";
import { LeadService } from "../services/leads/service/service.js";
import utils from "../utils/utils.js";
import { ParsedQs } from "qs";

export class LeadController {
  private service: LeadService;

  constructor() {
    this.service = new LeadService();

    this.getLeads = this.getLeads.bind(this);
    this.createLead = this.createLead.bind(this);
    this.updateLead = this.updateLead.bind(this);
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
}
