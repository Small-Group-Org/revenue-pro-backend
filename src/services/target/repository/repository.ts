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
      { userId: targetData.userId, startDate: targetData.startDate },
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
      },
      queryType
    }).sort({ startDate: 1 });
  }

  async findTargetByStartDate(userId: string, startDate: string, queryType:string): Promise<IWeeklyTargetDocument | null> {
    return this.model.findOne({ userId, startDate, queryType });
  }

  /**
   * Fetches each week's target for a given user and month, using findTargetByStartDate for each week.
   * @param userId - The user ID
   * @param weeksInMonth - Array of week info objects (with startDate)
   * @param queryType - The query type (e.g., 'monthly')
   * @returns Array of IWeeklyTargetDocument (may include nulls if not found)
   */
  async getMonthlyTargetsByWeeks(userId: string, weeksInMonth: { startDate: Date }[], queryType: string): Promise<(IWeeklyTargetDocument | null)[]> {
    const results = await Promise.all(
      weeksInMonth.map(week =>
        this.model.findOne({ userId, startDate: week.startDate, queryType })
      )
    );
    return results;
  }
} 