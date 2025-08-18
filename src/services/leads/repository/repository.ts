import LeadModel from '@/services/leads/repository/models/leads.model.js';
import { ILead, ILeadDocument } from '../domain/leads.domain.js';
import ConversionRateModel, { IConversionRate, IConversionRateDocument } from '@/services/leads/repository/models/conversionRate.model.js';

// ----------------- Lead Repository -----------------
export const leadRepository = {
  async createLead(data: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(data);
  },
  async getLeads(filter: Partial<ILead> = {}): Promise<ILeadDocument[]> {
    return await LeadModel.find(filter).exec();
  },
  async getLeadById(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findById(id).exec();
  },
  async updateLead(id: string, update: Partial<ILead>): Promise<ILeadDocument | null> {
    return await LeadModel.findByIdAndUpdate(id, update, { new: true }).exec();
  },
  async deleteLead(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findByIdAndDelete(id).exec();
  },
  async getLeadsByDateRange(start: string, end: string): Promise<ILeadDocument[]> {
    return await LeadModel.find({ leadDate: { $gte: start, $lte: end } }).exec();
  },
  async insertMany(leads: ILead[]): Promise<ILeadDocument[]> {
    return await LeadModel.insertMany(leads);
  }
};

// ----------------- ConversionRate Repository -----------------
export const conversionRateRepository = {
  async createConversionRate(data: IConversionRate): Promise<IConversionRateDocument> {
    return await ConversionRateModel.create(data);
  },
  async getConversionRates(filter: Partial<IConversionRate> = {}): Promise<IConversionRateDocument[]> {
    return await ConversionRateModel.find(filter).exec();
  },
  async getConversionRateById(id: string): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findById(id).exec();
  },
  async updateConversionRate(id: string, update: Partial<IConversionRate>): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findByIdAndUpdate(id, update, { new: true }).exec();
  },
  async deleteConversionRate(id: string): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findByIdAndDelete(id).exec();
  },
  async insertMany(conversionRates: IConversionRate[]): Promise<IConversionRateDocument[]> {
    return await ConversionRateModel.insertMany(conversionRates);
  },
  async upsertConversionRate(data: IConversionRate): Promise<IConversionRateDocument> {
    return await ConversionRateModel.findOneAndUpdate(
      { clientId: data.clientId, keyField: data.keyField, keyName: data.keyName },
      data,
      { new: true, upsert: true }
    ).exec();
  },

  /**
   * Batch upsert multiple conversion rates - much more efficient than individual upserts
   */
  async batchUpsertConversionRates(conversionRates: IConversionRate[]): Promise<IConversionRateDocument[]> {
    if (conversionRates.length === 0) return [];

    // Use MongoDB bulkWrite for efficient batch operations
    const bulkOps = conversionRates.map((rate) => ({
      updateOne: {
        filter: { 
          clientId: rate.clientId, 
          keyField: rate.keyField, 
          keyName: rate.keyName 
        },
        update: { $set: rate },
        upsert: true
      }
    }));

    await ConversionRateModel.bulkWrite(bulkOps);
    
    // Return the updated documents - fetch them after bulk operation
    const filters = conversionRates.map(rate => ({
      clientId: rate.clientId,
      keyField: rate.keyField,
      keyName: rate.keyName
    }));
    
    return await ConversionRateModel.find({ $or: filters }).exec();
  }
};
