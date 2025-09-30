import LeadModel from './models/leads.model.js';
import { ILead, ILeadDocument } from '../domain/leads.domain.js';
import { ILeadRepository } from './interfaces.js';

export class LeadRepository implements ILeadRepository {
  
  // Helper method to add soft delete filter consistently
  private addSoftDeleteFilter(query: any): any {
    return { ...query, isDeleted: false };
  }

  // Basic CRUD operations

  async updateLead(
    queryOrId: string | Partial<Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">>,
    update: Partial<ILead>
  ): Promise<ILeadDocument | null> {
    const query = typeof queryOrId === 'string'
      ? { _id: queryOrId, isDeleted: false }
      : this.addSoftDeleteFilter(queryOrId);

    return await LeadModel.findOneAndUpdate(query, update, { new: true }).exec();
  }

  async deleteLead(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    ).exec();
  }

  // Query operations
  async getLeadById(id: string): Promise<ILeadDocument | null> {
    return await LeadModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  async getLeads(filter: Partial<ILead> = {}): Promise<ILeadDocument[]> {
    return await LeadModel.find(this.addSoftDeleteFilter(filter)).exec();
  }

  async getLeadsByClientId(clientId: string): Promise<Partial<ILead>[]> {
    return await LeadModel.find({ clientId, isDeleted: false }).lean().exec();
  }

  async getLeadsByDateRange(start: string, end: string): Promise<ILeadDocument[]> {
    return await LeadModel.find({
      leadDate: { $gte: start, $lte: end },
      isDeleted: false
    }).exec();
  }

  async findLeads(query: Partial<ILead> = {}): Promise<Partial<ILead>[]> {
    return await LeadModel.find(this.addSoftDeleteFilter(query)).lean().exec();
  }

  // Bulk operations
  async insertMany(leads: ILead[]): Promise<ILeadDocument[]> {
    const normalizedLeads = leads.map(lead => ({ ...lead, isDeleted: false }));
    return await LeadModel.insertMany(normalizedLeads);
  }

  async bulkWriteLeads(
    bulkOps: Parameters<typeof LeadModel.bulkWrite>[0],
    options?: Parameters<typeof LeadModel.bulkWrite>[1]
  ): Promise<ReturnType<typeof LeadModel.bulkWrite>> {
    return await LeadModel.bulkWrite(bulkOps, options);
  }

  async bulkDeleteLeads(ids: string[]): Promise<{ modifiedCount: number }> {
    const query = { _id: { $in: ids }, isDeleted: false };
    const update = { 
      $set: { 
        isDeleted: true, 
        deletedAt: new Date() 
      } 
    };
    const result = await LeadModel.updateMany(query, update).exec();
    return { modifiedCount: result.modifiedCount || 0 };
  }

  async updateManyLeads(query: Partial<ILead>, update: any): Promise<any> {
    const finalQuery = this.addSoftDeleteFilter(query);
    return await LeadModel.updateMany(finalQuery, update).exec();
  }

  // Utility operations
  async existsByClientId(clientId: string): Promise<boolean> {
    const doc = await LeadModel.exists({ clientId, isDeleted: false });
    return doc !== null;
  }

  async getDistinctClientIds(): Promise<string[]> {
    return await LeadModel.distinct("clientId", { isDeleted: false }).exec();
  }

  // Upsert operation
  async upsertLead(
    query: Partial<Pick<ILeadDocument, "clientId" | "adSetName" | "email" | "phone" | "service" | "adName" | "zip">>,
    leadPayload: Partial<ILead>
  ): Promise<ILeadDocument> {
    const finalQuery = this.addSoftDeleteFilter(query);
    const finalPayload = { ...leadPayload, isDeleted: false };
    
    return await LeadModel.findOneAndUpdate(
      finalQuery,
      { $set: finalPayload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).exec();
  }
}

// Export singleton instance
export const leadRepository = new LeadRepository();
