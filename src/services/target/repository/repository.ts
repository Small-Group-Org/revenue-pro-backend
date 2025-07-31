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

  async getTargetsByDateRangeAndQueryType(startDate: Date, endDate: Date, userId: string, queryType: string): Promise<IWeeklyTargetDocument[]> {
    return this.model.find({
      userId,
      startDate: {
        $gte: startDate,
        $lte: endDate
      }
      // Removed queryType filter since we want to get all targets in the date range regardless of queryType
    }).sort({ startDate: 1 });
  }

  async findTargetByStartDate(userId: string, startDate: string, queryType:string): Promise<IWeeklyTargetDocument | null> {
    // Get week details from the startDate to find the correct year and weekNumber
    const { DateUtils } = await import('../../../utils/date.utils.js');
    const weekData = DateUtils.getWeekDetails(startDate);
    
    // Use the unique index fields: userId, year, weekNumber
    return this.model.findOne({ 
      userId, 
      year: weekData.year, 
      weekNumber: weekData.weekNumber 
    });
  }

  /**
   * Fetches each week's target for a given user and month, using findTargetByStartDate for each week.
   * @param userId - The user ID
   * @param weeksInMonth - Array of week info objects (with startDate)
   * @param queryType - The query type (e.g., 'monthly')
   * @returns Array of IWeeklyTargetDocument (may include nulls if not found)
   */
  async getMonthlyTargetsByWeeks(userId: string, weeksInMonth: { startDate: Date }[], queryType: string): Promise<(IWeeklyTargetDocument | null)[]> {
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
} 