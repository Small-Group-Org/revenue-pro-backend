import CreativeModel from './models/creatives.model.js';
import { ICreative } from '../domain/creatives.domain.js';

export class CreativesRepository {
  /**
   * Get creative by ID
   */
  async getCreativeById(creativeId: string): Promise<ICreative | null> {
    const creative = await CreativeModel.findOne({ creativeId, isDeleted: false });
    return creative ? creative.toObject() : null;
  }

  /**
   * Get multiple creatives by IDs
   */
  async getCreativesByIds(creativeIds: string[]): Promise<ICreative[]> {
    const creatives = await CreativeModel.find({
      creativeId: { $in: creativeIds },
      isDeleted: false
    });
    return creatives.map(c => c.toObject());
  }

  /**
   * Get creatives by ad account
   */
  async getCreativesByAdAccount(
    adAccountId: string,
    limit: number = 100
  ): Promise<ICreative[]> {
    const creatives = await CreativeModel
      .find({ adAccountId, isDeleted: false })
      .sort({ lastFetchedAt: -1 })
      .limit(limit);
    return creatives.map(c => c.toObject());
  }

  /**
   * Save or update creative
   */
  async upsertCreative(creativeData: Partial<ICreative>): Promise<ICreative> {
    const updated = await CreativeModel.findOneAndUpdate(
      { creativeId: creativeData.creativeId },
      { $set: creativeData },
      { upsert: true, new: true }
    );
    return updated.toObject();
  }

  /**
   * Save or update multiple creatives
   */
  async upsertCreatives(creativesData: Partial<ICreative>[]): Promise<number> {
    const operations = creativesData.map(creative => ({
      updateOne: {
        filter: { creativeId: creative.creativeId },
        update: { $set: creative },
        upsert: true
      }
    }));

    const result = await CreativeModel.bulkWrite(operations);
    return result.upsertedCount + result.modifiedCount;
  }

  /**
   * Delete creative (soft delete)
   */
  async deleteCreative(creativeId: string): Promise<boolean> {
    const result = await CreativeModel.updateOne(
      { creativeId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Get total count of creatives
   */
  async getCreativesCount(adAccountId?: string): Promise<number> {
    const filter: any = { isDeleted: false };
    if (adAccountId) {
      filter.adAccountId = adAccountId;
    }
    return await CreativeModel.countDocuments(filter);
  }
}

export const creativesRepository = new CreativesRepository();
