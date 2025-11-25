import { IWeeklyActual } from "../domain/actual.domain.js";
import { IWeeklyActualDocument } from "../repository/models/actual.model.js";
import { ActualRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";

export class ActualService {
  private actualRepository: ActualRepository;

  constructor() {
    this.actualRepository = new ActualRepository();
  }

  public async getActualYearlyMonthlyAggregate(
    userId: string,
    year: number
  ): Promise<IWeeklyActual[]> {
    const results: IWeeklyActual[] = [];

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const monthEndStr = monthEnd.toISOString().slice(0, 10);
      const weeks = DateUtils.getMonthWeeks(monthStartStr, monthEndStr);

      const weeklyActuals = await Promise.all(
        weeks.map(async ({ weekStart, weekEnd }) => {
          const actual = await this.actualRepository.findActualByStartDate(userId, weekStart);
          return actual
            ? actual.toObject()
            : this._zeroFilledActual(weekStart, weekEnd, userId);
        })
      );

      let aggregated: IWeeklyActual;
      if (weeklyActuals.length === 0) {
        aggregated = this._zeroFilledActual(monthStartStr, monthEndStr, userId);
      } else {
        aggregated = weeklyActuals.reduce((acc, curr) => {
          acc.testingBudgetSpent += curr.testingBudgetSpent || 0;
          acc.awarenessBrandingBudgetSpent += curr.awarenessBrandingBudgetSpent || 0;
          acc.leadGenerationBudgetSpent += curr.leadGenerationBudgetSpent || 0;
          acc.revenue += curr.revenue || 0;
          acc.sales += curr.sales || 0;
          acc.leads += curr.leads || 0;
          acc.estimatesRan += curr.estimatesRan || 0;
          acc.estimatesSet += curr.estimatesSet || 0;
          return acc;
        }, this._zeroFilledActual(monthStartStr, monthEndStr, userId));
      }

      aggregated.startDate = monthStartStr;
      aggregated.endDate = monthEndStr;
      results.push(aggregated);
    }

    return results;
  }

  private _zeroFilledActual(
    startDate: string,
    endDate: string,
    userId: string
  ): IWeeklyActual {
    return {
      userId,
      startDate,
      endDate,
      testingBudgetSpent: 0,
      awarenessBrandingBudgetSpent: 0,
      leadGenerationBudgetSpent: 0,
      revenue: 0,
      sales: 0,
      leads: 0,
      estimatesRan: 0,
      estimatesSet: 0,
      adNamesAmount: [],
    };
  }

  public async upsertActualWeekly(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyActual>
  ): Promise<IWeeklyActualDocument> {
    const week = DateUtils.getWeekDetails(startDate);

    const payload: IWeeklyActual = {
      userId,
      startDate: week.weekStart,
      endDate: week.weekEnd,
      testingBudgetSpent: data.testingBudgetSpent ?? 0,
      awarenessBrandingBudgetSpent: data.awarenessBrandingBudgetSpent ?? 0,
      leadGenerationBudgetSpent: data.leadGenerationBudgetSpent ?? 0,
      revenue: data.revenue ?? 0,
      sales: data.sales ?? 0,
      leads: data.leads ?? 0,
      estimatesRan: data.estimatesRan ?? 0,
      estimatesSet: data.estimatesSet ?? 0,
      adNamesAmount: data.adNamesAmount ?? [],
    };

    const existing = await this.actualRepository.findActualByStartDate(
      userId,
      week.weekStart
    );

    let actual: IWeeklyActualDocument | null;

    if (existing) {
      actual = await this.actualRepository.updateActual({
        ...existing.toObject(),
        ...payload,
      });
    } else {
      actual = await this.actualRepository.createActual(payload);
    }

    if (!actual) throw new Error("Upsert failed for actual data");
    return actual;
  }

  public async getActualWeekly(
    userId: string,
    date: string
  ): Promise<IWeeklyActual> {
    const week = DateUtils.getWeekDetails(date);
    const actual = await this.actualRepository.findActualByStartDate(
      userId,
      week.weekStart
    );

    return actual
      ? actual.toObject()
      : this._zeroFilledActual(week.weekStart, week.weekEnd, userId);
  }

  public async getActualMonthly(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<IWeeklyActual[]> {
    const weeks = DateUtils.getMonthWeeks(startDate, endDate);

    return await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        const actual = await this.actualRepository.findActualByStartDate(
          userId,
          weekStart
        );
        return actual
          ? actual.toObject()
          : this._zeroFilledActual(weekStart, weekEnd, userId);
      })
    );
  }

  public async getActualYearly(
    userId: string,
    year: number
  ): Promise<IWeeklyActual[]> {
    const weeks = DateUtils.getYearWeeks(year);

    return await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        const actual = await this.actualRepository.findActualByStartDate(
          userId,
          weekStart
        );
        return actual
          ? actual.toObject()
          : this._zeroFilledActual(weekStart, weekEnd, userId);
      })
    );
  }

  public async getActualsByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<IWeeklyActual[]> {
    const weeks = DateUtils.getMonthWeeks(startDate, endDate);

    return await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        const actual = await this.actualRepository.findActualByStartDate(
          userId,
          weekStart
        );
        return actual
          ? actual.toObject()
          : this._zeroFilledActual(weekStart, weekEnd, userId);
      })
    );
  }

  public async getActualByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    type: "weekly" | "monthly" | "yearly"
  ): Promise<IWeeklyActual | IWeeklyActual[]> {
    switch (type) {
      case "weekly":
        return this.getActualWeekly(userId, startDate);
      case "monthly":
        return this.getActualMonthly(userId, startDate, endDate);
      case "yearly":
        return this.getActualYearlyMonthlyAggregate(userId, new Date(startDate).getFullYear());
      default:
        throw new Error("Invalid type provided");
    }
  }

  /**
   * MASTER AGGREGATE: Get actual data for ALL users (aggregated)
   * Returns the same structure as individual user queries
   */
  public async getAggregatedActualsForAllUsers(
    startDateStr: string,
    endDateStr: string
  ): Promise<IWeeklyActual[]> {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    // Check if it's a full year
    const isFullYear =
      start.getMonth() === 0 &&
      start.getDate() === 1 &&
      end.getMonth() === 11 &&
      (end.getDate() === 31 || 
        (end.getMonth() === 11 && 
          new Date(end.getFullYear(), 11, 31).getDate() === end.getDate())) &&
      start.getFullYear() === end.getFullYear();

    if (isFullYear) {
      // Return 12 monthly aggregates for all users
      return await this.getActualYearlyMonthlyAggregateForAllUsers(start.getFullYear());
    } else {
      // Return date range aggregate for all users
      return await this.getActualsByDateRangeForAllUsers(startDateStr, endDateStr);
    }
  }

  /**
   * Get actual data by date range for ALL users (aggregated)
   * Same structure as getActualsByDateRange but summed across all users
   */
  private async getActualsByDateRangeForAllUsers(
    startDateStr: string,
    endDateStr: string
  ): Promise<IWeeklyActual[]> {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    // Get all weeks in the date range
    const weeks = DateUtils.getMonthWeeks(startDateStr, endDateStr);

    // For each week, aggregate data from all users
    const aggregatedWeeks = await Promise.all(
      weeks.map(async ({ weekStart, weekEnd }) => {
        // Find all actuals for this week across all users
        const actuals = await this.actualRepository.findActualsByQuery({
          startDate: weekStart,
          endDate: weekEnd,
        });

        // If no actuals found, return zero-filled
        if (actuals.length === 0) {
          return this._zeroFilledActual(weekStart, weekEnd, "ALL_USERS");
        }
        // Get unique user count
        const uniqueUsers = new Set(actuals.map(a => a.userId.toString()));
        // Aggregate all actuals for this week
        const aggregated: IWeeklyActual = {
          userId: "ALL_USERS",
          startDate: weekStart,
          endDate: weekEnd,
          testingBudgetSpent: actuals.reduce((sum: number, a) => sum + (a.testingBudgetSpent || 0), 0),
          awarenessBrandingBudgetSpent: actuals.reduce((sum: number, a) => sum + (a.awarenessBrandingBudgetSpent || 0), 0),
          leadGenerationBudgetSpent: actuals.reduce((sum: number, a) => sum + (a.leadGenerationBudgetSpent || 0), 0),
          revenue: actuals.reduce((sum: number, a) => sum + (a.revenue || 0), 0),
          sales: actuals.reduce((sum: number, a) => sum + (a.sales || 0), 0),
          leads: actuals.reduce((sum: number, a) => sum + (a.leads || 0), 0),
          estimatesRan: actuals.reduce((sum: number, a) => sum + (a.estimatesRan || 0), 0),
          estimatesSet: actuals.reduce((sum: number, a) => sum + (a.estimatesSet || 0), 0),
          adNamesAmount: [], // Don't aggregate ad names for now
        };

        return aggregated;
      })
    );

    return aggregatedWeeks;
  }

  /**
   * Get yearly monthly aggregate for ALL users
   * Returns 12 months of data (Jan-Dec) with all users aggregated
   */
  private async getActualYearlyMonthlyAggregateForAllUsers(year: number): Promise<IWeeklyActual[]> {
    const results: IWeeklyActual[] = [];

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const monthEndStr = monthEnd.toISOString().slice(0, 10);
      const weeks = DateUtils.getMonthWeeks(monthStartStr, monthEndStr);

      // Get all actuals for all weeks in this month across all users
      const weeklyActuals = await Promise.all(
        weeks.map(async ({ weekStart, weekEnd }) => {
          const actuals = await this.actualRepository.findActualsByQuery({
            startDate: weekStart,
            endDate: weekEnd,
          });

          if (actuals.length === 0) {
            return this._zeroFilledActual(weekStart, weekEnd, "ALL_USERS");
          }

          // Aggregate this week's data
          return {
            userId: "ALL_USERS",
            startDate: weekStart,
            endDate: weekEnd,
            testingBudgetSpent: actuals.reduce((sum: number, a) => sum + (a.testingBudgetSpent || 0), 0),
            awarenessBrandingBudgetSpent: actuals.reduce((sum: number, a) => sum + (a.awarenessBrandingBudgetSpent || 0), 0),
            leadGenerationBudgetSpent: actuals.reduce((sum: number, a) => sum + (a.leadGenerationBudgetSpent || 0), 0),
            revenue: actuals.reduce((sum: number, a) => sum + (a.revenue || 0), 0),
            sales: actuals.reduce((sum: number, a) => sum + (a.sales || 0), 0),
            leads: actuals.reduce((sum: number, a) => sum + (a.leads || 0), 0),
            estimatesRan: actuals.reduce((sum: number, a) => sum + (a.estimatesRan || 0), 0),
            estimatesSet: actuals.reduce((sum: number, a) => sum + (a.estimatesSet || 0), 0),
            adNamesAmount: [],
          } as IWeeklyActual;
        })
      );

      // Aggregate all weeks in this month
      let aggregated: IWeeklyActual;
      if (weeklyActuals.length === 0) {
        aggregated = this._zeroFilledActual(monthStartStr, monthEndStr, "ALL_USERS");
      } else {
        aggregated = weeklyActuals.reduce((acc, curr) => {
          acc.testingBudgetSpent += curr.testingBudgetSpent || 0;
          acc.awarenessBrandingBudgetSpent += curr.awarenessBrandingBudgetSpent || 0;
          acc.leadGenerationBudgetSpent += curr.leadGenerationBudgetSpent || 0;
          acc.revenue += curr.revenue || 0;
          acc.sales += curr.sales || 0;
          acc.leads += curr.leads || 0;
          acc.estimatesRan += curr.estimatesRan || 0;
          acc.estimatesSet += curr.estimatesSet || 0;
          return acc;
        }, this._zeroFilledActual(monthStartStr, monthEndStr, "ALL_USERS"));
      }

      aggregated.startDate = monthStartStr;
      aggregated.endDate = monthEndStr;
      results.push(aggregated);
    }

    return results;
  }

  /**
   * Get users with their total revenue for a date range, including user details
   * @param startDate - Start date in ISO format (YYYY-MM-DD)
   * @param endDate - End date in ISO format (YYYY-MM-DD)
   * @returns Array of objects with user details and total revenue
   */
  public async getUsersRevenueByDateRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ userId: string; userName: string; userEmail: string; totalRevenue: number; testingBudgetSpent?: number; awarenessBrandingBudgetSpent?: number; leadGenerationBudgetSpent?: number; totalBudgetSpent?: number }>> {
    const revenueData = await this.actualRepository.getUsersRevenueByDateRange(startDate, endDate);
    return revenueData;
  }

  /**
   * Update weekly reporting data
   */
  async updateWeeklyReporting(
    userId: string,
    startDate: string,
    updateData: {
      revenue?: number;
      leads?: number;
      estimatesRan?: number;
      estimatesSet?: number;
      sales?: number;
    }
  ): Promise<IWeeklyActualDocument> {
    // Validate that at least one field is provided
    if (
      updateData.revenue === undefined &&
      updateData.leads === undefined &&
      updateData.estimatesRan === undefined &&
      updateData.estimatesSet === undefined &&
      updateData.sales === undefined
    ) {
      throw new Error("At least one field must be provided for update");
    }

    // Validate numeric values
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && (typeof value !== "number" || value < 0)) {
        throw new Error(`${key} must be a non-negative number`);
      }
    });

    const updated = await this.actualRepository.updateWeeklyReporting(
      userId,
      startDate,
      updateData
    );

    if (!updated) {
      throw new Error("Failed to update weekly reporting data");
    }

    return updated;
  }
}
