import { ILead, ILeadDocument } from "../domain/leads.domain.js";
import LeadModel from "../repository/models/leads.model.js";

export class LeadService {
  public async getLeads(
    clientId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ILeadDocument[]> {
    const query: any = {};

    if (clientId) {
      query.clientId = clientId;

      if (startDate && endDate) {
        query.leadDate = { $gte: startDate, $lte: endDate };
      } else if (startDate) {
        query.leadDate = { $gte: startDate };
      } else if (endDate) {
        query.leadDate = { $lte: endDate };
      }
    }

    return await LeadModel.find(query).exec();
  }

  public async createLead(payload: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(payload);
  }

  public async updateLead(
    id: string,
    data: Partial<Pick<ILead, "estimateSet" | "unqualifiedLeadReason">>
  ): Promise<ILeadDocument> {
    const existing = await LeadModel.findById(id);
    if (!existing) {
      throw new Error("Lead not found");
    }

    if (typeof data.estimateSet !== "undefined") {
      existing.estimateSet = data.estimateSet;
    }
    if (typeof data.unqualifiedLeadReason !== "undefined") {
      existing.unqualifiedLeadReason = data.unqualifiedLeadReason;
    }

    await existing.save();
    return existing;
  }
}