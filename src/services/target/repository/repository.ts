import { Model } from 'mongoose';
import { IWeeklyTarget } from '../domain/target.domain.js';
import WeeklyTarget, { IWeeklyTargetDocument } from './models/target.model.js';

export class TargetRepository {
  private model: Model<IWeeklyTargetDocument>;

  constructor() {
    this.model = WeeklyTarget;
  }

  async createTarget(targetData: IWeeklyTarget): Promise<IWeeklyTargetDocument> {
    return this.model.create(targetData);
  }

  async updateTarget(targetData: IWeeklyTarget): Promise<IWeeklyTargetDocument | null> {
    return this.model.findOneAndUpdate(
      { 
        userId: targetData.userId, 
        year: targetData.year, 
        weekNumber: targetData.weekNumber 
      },
      targetData,
      { new: true }
    );
  }

  async debugAllTargetsForUser(userId: string): Promise<IWeeklyTargetDocument[]> {
    
    const allTargets = await this.model.find({ userId }).sort({ startDate: 1 });
    
    return allTargets;
  }

  async getTargetsByDateRange(startDate: Date, endDate: Date, userId: string): Promise<IWeeklyTargetDocument[]> {
    
    // Convert Date objects to string format (YYYY-MM-DD) for string comparison
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    
    const query = {
      userId,
      startDate: {
        $gte: startDateStr,
        $lte: endDateStr
      }
    };
    
    
    const results = await this.model.find(query).sort({ startDate: 1 });
    
    return results;
  }

  async findTargetByStartDate(userId: string, startDate: string): Promise<IWeeklyTargetDocument | null> {
    // Get week details from the startDate to find the correct year and weekNumber
    const { DateUtils } = await import('../../../utils/date.utils.js');
    const weekData = DateUtils.getWeekDetails(startDate);
    
    // Since there can only be one target per week per user (unique index),
    // we just find the target for this week
    const query = { 
      userId, 
      year: weekData.year, 
      weekNumber: weekData.weekNumber 
    };
    
    
    // Use the unique index fields: userId, year, weekNumber
    return this.model.findOne(query);
  }

  /**
   * Fetches each week's target for a given user and month.
   * @param userId - The user ID
   * @param weeksInMonth - Array of week info objects (with startDate)
   * @returns Array of IWeeklyTargetDocument (may include nulls if not found)
   */
  async getMonthlyTargetsByWeeks(userId: string, weeksInMonth: { startDate: Date }[]): Promise<(IWeeklyTargetDocument | null)[]> {
    const { DateUtils } = await import('../../../utils/date.utils.js');
    
    const results = await Promise.all(
      weeksInMonth.map(async week => {
        const weekData = DateUtils.getWeekDetails(week.startDate.toISOString().split('T')[0]);
        return this.model.findOne({ 
          userId, 
          year: weekData.year, 
          weekNumber: weekData.weekNumber 
        });
      })
    );
    return results;
  }

  /**
   * Find targets by query - for aggregation across all users
   */
  async findTargetsByQuery(query: any): Promise<IWeeklyTargetDocument[]> {
    return await this.model.find(query).sort({ startDate: 1 });
  }
} 