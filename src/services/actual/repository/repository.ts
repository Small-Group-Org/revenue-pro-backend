import { Model } from "mongoose";
import WeeklyActual, { IWeeklyActualDocument } from "./models/actual.model.js";
import { IWeeklyActual } from "../domain/actual.domain.js"; // Ensure this domain interface exists
import { clear, log } from "console";

export class ActualRepository {
  private model: Model<IWeeklyActualDocument>;

  constructor() {
    this.model = WeeklyActual;
  }

  async createActual(data: IWeeklyActual): Promise<IWeeklyActualDocument> {
    const res = await this.model.create(data);
    return res;
  }

  async updateActual(
    data: IWeeklyActual
  ): Promise<IWeeklyActualDocument | null> {
    const res = await this.model.findOneAndUpdate(
        { userId: data.userId, startDate: data.startDate },
      data,
     
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res;
  }

  async getActualsByDateRange(
    startDate: string,
    endDate: string,
    userId: string
  ): Promise<IWeeklyActualDocument[]> {
    const res = await this.model
      .find({
        userId,
        startDate: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ startDate: 1 });
    return res;
  }

  async findActualByStartDate(
    userId: string,
    startDate: string
  ): Promise<IWeeklyActualDocument | null> {
    return await this.model.findOne({ userId, startDate });
  }

  /**
   * Fetches each week's actual data for a given user and month.
   * @param userId - The user ID
   * @param weeksInMonth - Array of week info objects (with startDate)
   * @returns Array of IWeeklyActualDocument (may include nulls if not found)
   */
  async getMonthlyActualsByWeeks(
    userId: string,
    weeksInMonth: { startDate: Date }[]
  ): Promise<(IWeeklyActualDocument | null)[]> {
    return Promise.all(
      weeksInMonth.map((week) =>
        this.model.findOne({ userId, startDate: week.startDate })
      )
    );
  }

  /**
   * Aggregate latest weekly report updates per client (userId)
   * Returns data sorted by latest update first (most recent to oldest/never updated)
   */
  async aggregateWeeklyActivity(): Promise<{ _id: string; weeklyReportLastActiveAt: Date | null }[]> {
    return await this.model.aggregate([
      {
        $project: { userId: 1, updatedAt: 1 } // keep only what's needed
      },
      {
        $sort: { userId: 1, updatedAt: -1 } // uses the index
      },
      {
        $group: {
          _id: "$userId",
          weeklyReportLastActiveAt: { $first: "$updatedAt" }
        }
      },
      {
        $sort: { weeklyReportLastActiveAt: -1 }
      }
    ]);
  }

  /**
   * Find actuals by query - for aggregation across all users
   */
  async findActualsByQuery(query: any): Promise<IWeeklyActualDocument[]> {
    return await this.model.find(query).sort({ startDate: 1 });
  }
}
