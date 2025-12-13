import FbWeeklyAnalyticsModel from './models/fbWeeklyAnalytics.model.js';
import { IFbWeeklyAnalytics, IFbWeeklyAnalyticsDocument } from '../domain/fbWeeklyAnalytics.domain.js';

export class FbWeeklyAnalyticsRepository {
  
  // Helper method to add soft delete filter consistently
  private addSoftDeleteFilter(query: any): any {
    return { ...query, isDeleted: false };
  }

  /**
   * Save a single weekly analytics record
   * Upserts based on clientId, ad_id, and weekStartDate to avoid duplicates
   */
  async saveWeeklyAnalytics(data: Omit<IFbWeeklyAnalytics, 'savedAt' | 'isDeleted' | 'deletedAt'>): Promise<IFbWeeklyAnalyticsDocument> {
    const filter = {
      clientId: data.clientId,
      adId: data.adId,
      weekStartDate: data.weekStartDate
    };
    
    const update = {
      ...data,
      savedAt: new Date()
    };

    return await FbWeeklyAnalyticsModel.findOneAndUpdate(
      filter,
      { $set: update },
      { upsert: true, new: true }
    ).exec();
  }

  /**
   * Bulk save multiple weekly analytics records
   * Uses bulkWrite for efficiency
   */
  async bulkSaveWeeklyAnalytics(dataArray: Omit<IFbWeeklyAnalytics, 'savedAt' | 'isDeleted' | 'deletedAt'>[]): Promise<{ saved: number; errors: any[] }> {
    const operations = dataArray.map(data => ({
      updateOne: {
        filter: {
          clientId: data.clientId,
          adId: data.adId,
          weekStartDate: data.weekStartDate
        },
        update: {
          $set: {
            ...data,
            savedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    try {
      const result = await FbWeeklyAnalyticsModel.bulkWrite(operations);
      return {
        saved: result.upsertedCount + result.modifiedCount,
        errors: []
      };
    } catch (error: any) {
      console.error('[FbWeeklyAnalyticsRepository] Bulk save error:', error);
      return {
        saved: 0,
        errors: [error]
      };
    }
  }

  /**
   * Get analytics by clientId and date range
   */
  async getAnalyticsByDateRange(
    clientId: string,
    startDate: string,
    endDate: string
  ): Promise<IFbWeeklyAnalyticsDocument[]> {
    return await FbWeeklyAnalyticsModel.find({
      clientId,
      weekStartDate: { $lte: endDate },
      weekEndDate: { $gte: startDate },
      isDeleted: false
    }).exec();
  }

  /**
   * Get analytics by clientId, ad_id, and date range
   */
  async getAnalyticsByAdAndDateRange(
    clientId: string,
    adId: string,
    startDate: string,
    endDate: string
  ): Promise<IFbWeeklyAnalyticsDocument[]> {
    return await FbWeeklyAnalyticsModel.find({
      clientId,
      ad_id: adId,
      weekStartDate: { $lte: endDate },
      weekEndDate: { $gte: startDate },
      isDeleted: false
    }).exec();
  }

  /**
   * Get all analytics for a client
   */
  async getAnalyticsByClientId(clientId: string): Promise<IFbWeeklyAnalyticsDocument[]> {
    return await FbWeeklyAnalyticsModel.find(
      this.addSoftDeleteFilter({ clientId })
    ).exec();
  }

  /**
   * Get analytics by campaign
   */
  async getAnalyticsByCampaign(
    clientId: string,
    campaignId: string
  ): Promise<IFbWeeklyAnalyticsDocument[]> {
    return await FbWeeklyAnalyticsModel.find(
      this.addSoftDeleteFilter({ clientId, campaign_id: campaignId })
    ).exec();
  }

  /**
   * Soft delete analytics record
   */
  async deleteAnalytics(id: string): Promise<IFbWeeklyAnalyticsDocument | null> {
    return await FbWeeklyAnalyticsModel.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    ).exec();
  }

  /**
   * Soft delete all analytics for a client within a date range
   */
  async deleteAnalyticsByDateRange(
    clientId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    const result = await FbWeeklyAnalyticsModel.updateMany(
      {
        clientId,
        weekStartDate: { $lte: endDate },
        weekEndDate: { $gte: startDate },
        isDeleted: false
      },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    ).exec();
    
    return result.modifiedCount;
  }

  /**
   * Get aggregated insights by campaign for a date range
   */
  async getAggregatedByCampaign(
    clientId: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    return await FbWeeklyAnalyticsModel.aggregate([
      {
        $match: {
          clientId,
          weekStartDate: { $lte: endDate },
          weekEndDate: { $gte: startDate },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: {
            campaign_id: '$campaign_id',
            campaign_name: '$campaign_name'
          },
          totalImpressions: { $sum: '$insights.impressions' },
          totalClicks: { $sum: '$insights.clicks' },
          totalSpend: { $sum: '$insights.spend' },
          adCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalSpend: -1 }
      }
    ]).exec();
  }
}

// Export singleton instance
export const fbWeeklyAnalyticsRepository = new FbWeeklyAnalyticsRepository();
