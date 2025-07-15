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

  async findTargetByStartDate(userId: string, startDate: Date): Promise<IWeeklyTargetDocument | null> {
    return this.model.findOne({ userId, startDate });
  }
} 