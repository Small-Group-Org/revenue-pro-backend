import LeadModel, { ILead, ILeadDocument } from '@/services/leads/repository/models/leads.model.js';

export const leadRepository = {
  /**
   * Create a new lead
   */
  async createLead(data: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(data);
  },

  /**
   * Get all leads (optionally filtered by clientId, date, etc.)
   */
  async getLeads(filter: Partial<ILead> = {}): Promise<ILeadDocument[]> {
    return await LeadModel.find(filter).exec();
  },

  /**
   * Get a lead by ID
   */
  async getLeadById(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findById(id).exec();
  },

  /**
   * Update a lead by ID
   */
  async updateLead(id: string, update: Partial<ILead>): Promise<ILeadDocument | null> {
    return await LeadModel.findByIdAndUpdate(id, update, { new: true }).exec();
  },

  /**
   * Delete a lead by ID
   */
  async deleteLead(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findByIdAndDelete(id).exec();
  },

  /**
   * Get leads by date range
   */
  async getLeadsByDateRange(start: string, end: string): Promise<ILeadDocument[]> {
    return await LeadModel.find({
      leadDate: { $gte: start, $lte: end },
    }).exec();
  },

  /**
   * Bulk insert leads (e.g. for importing dummy data)
   */
  async insertMany(leads: ILead[]): Promise<ILeadDocument[]> {
    return await LeadModel.insertMany(leads);
  }
};
