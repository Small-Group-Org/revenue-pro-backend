import ConversionRateModel, { IConversionRate, IConversionRateDocument } from './models/conversionRate.model.js';
import { IConversionRateRepository } from './interfaces.js';

export class ConversionRateRepository implements IConversionRateRepository {
  
  // Basic CRUD operations
  async createConversionRate(data: IConversionRate): Promise<IConversionRateDocument> {
    return await ConversionRateModel.create(data);
  }

  async updateConversionRate(id: string, update: Partial<IConversionRate>): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async deleteConversionRate(id: string): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findByIdAndDelete(id).exec();
  }

  // Query operations
  async getConversionRateById(id: string): Promise<IConversionRateDocument | null> {
    return await ConversionRateModel.findById(id).exec();
  }

  async getConversionRates(filter: Partial<IConversionRate> = {}): Promise<IConversionRateDocument[]> {
    return await ConversionRateModel.find(filter).exec();
  }

  // Bulk operations
  async insertMany(conversionRates: IConversionRate[]): Promise<IConversionRateDocument[]> {
    return await ConversionRateModel.insertMany(conversionRates);
  }

  /**
   * Batch upsert multiple conversion rates - much more efficient than individual upserts
   * Returns detailed statistics about new vs updated records
   */
  async batchUpsertConversionRates(conversionRates: IConversionRate[]): Promise<{
    documents: IConversionRateDocument[];
    stats: {
      total: number;
      newInserts: number;
      updated: number;
    };
  }> {
    if (conversionRates.length === 0) {
      return { 
        documents: [], 
        stats: { total: 0, newInserts: 0, updated: 0 } 
      };
    }

    // First, get existing conversion rates to compare values
    const filters = conversionRates.map(rate => ({
      clientId: rate.clientId,
      keyField: rate.keyField,
      keyName: rate.keyName
    }));
    
    const existingRates = await ConversionRateModel.find({ $or: filters }).lean().exec();
    const existingRatesMap = new Map();
    existingRates.forEach(rate => {
      const key = `${rate.clientId}-${rate.keyField}-${rate.keyName}`;
      existingRatesMap.set(key, rate);
    });

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

    const result = await ConversionRateModel.bulkWrite(bulkOps);
    
    // Count actual changes by comparing values
    let newInserts = result.upsertedCount || 0;
    let actuallyUpdated = 0;
    
    conversionRates.forEach(rate => {
      const key = `${rate.clientId}-${rate.keyField}-${rate.keyName}`;
      const existing = existingRatesMap.get(key);
      
      if (existing) {
        // Check if values actually changed
        if (existing.conversionRate !== rate.conversionRate || 
            existing.pastTotalCount !== rate.pastTotalCount || 
            existing.pastTotalEst !== rate.pastTotalEst) {
          actuallyUpdated++;
        }
      }
    });
    
    const total = newInserts + actuallyUpdated;
    
    // Return the updated documents - fetch them after bulk operation
    const documents = await ConversionRateModel.find({ $or: filters }).exec();
    
    return {
      documents,
      stats: {
        total,
        newInserts,
        updated: actuallyUpdated
      }
    };
  }

  // Upsert operation
  async upsertConversionRate(data: IConversionRate): Promise<IConversionRateDocument> {
    return await ConversionRateModel.findOneAndUpdate(
      { clientId: data.clientId, keyField: data.keyField, keyName: data.keyName },
      data,
      { new: true, upsert: true }
    ).exec();
  }
}

// Export singleton instance
export const conversionRateRepository = new ConversionRateRepository();
