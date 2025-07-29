import { IWeeklyTarget } from "../domain/target.domain.js";
import { IWeeklyTargetDocument } from "../repository/models/target.model.js";
import { TargetRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
  }

  private _aggregateTargets(
    targets: IWeeklyTargetDocument[],
    queryType: string
  ): IWeeklyTargetDocument {
    if (targets.length === 0) {
      return {
        userId: "",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: queryType,
        year: new Date().getFullYear(),
        weekNumber: 0,
      } as unknown as IWeeklyTargetDocument;
    }

    const aggregated: IWeeklyTarget = {
      userId: targets[0].userId,
      startDate: targets[0].startDate,
      endDate: targets[targets.length - 1].endDate,
      year: targets[0].year,
      weekNumber: targets[0].weekNumber,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      queryType: targets[0].queryType || "",
    };

    for (const target of targets) {
      aggregated.revenue += target.revenue || 0;
    }
    aggregated.avgJobSize = targets[0].avgJobSize || 0;
    aggregated.appointmentRate = targets[0].appointmentRate || 0;
    aggregated.showRate = targets[0].showRate || 0;
    aggregated.closeRate = targets[0].closeRate || 0;
    aggregated.com = targets[0].com || 0;

    return aggregated as IWeeklyTargetDocument;
  }

  public async upsertWeeklyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument> {
    const weekData = DateUtils.getWeekDetails(startDate);
    const defaultTarget: IWeeklyTarget = {
      userId,
      startDate: weekData.weekStart,
      endDate: weekData.weekEnd,
      year: weekData.year,
      weekNumber: weekData.weekNumber,
      appointmentRate: data?.appointmentRate ?? 0,
      avgJobSize: data.avgJobSize ?? 0,
      closeRate: data?.closeRate ?? 0,
      com: data.com ?? 0,
      revenue: data?.revenue ?? 0,
      showRate: data?.showRate ?? 0,
      queryType: queryType,
    };    

    // Try to find an existing target
    const existingTarget = await this.targetRepository.findTargetByStartDate(
      userId,
      startDate,
      queryType
    );
      
    let target: IWeeklyTargetDocument | null;
    if (existingTarget) {
      // If target exists, update it
      target = await this.targetRepository.updateTarget({
        ...existingTarget.toObject(),
        ...data,
        queryType,
      });
      console.log("existing target");
    } else {
      // If no target exists, create a new one
      target = await this.targetRepository.createTarget({
        ...defaultTarget,
        queryType,
      });
      console.log("new target");
    }

    if (!target) throw new Error("Failed to update or create weekly target.");
    return target;
  }

  private async _upsertMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    data: Partial<IWeeklyTarget>,
    queryType: string
  ): Promise<IWeeklyTargetDocument> {
    const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
    if (weeksInMonth.length === 0) {
      return this._aggregateTargets([], queryType);
    }
    const monthlyProratedData: Partial<IWeeklyTarget> = {
      ...data,
      revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
      avgJobSize: data.avgJobSize ? data.avgJobSize : 0,
      appointmentRate: data.appointmentRate ? data.appointmentRate : 0,
      showRate: data.showRate ? data.showRate : 0,
      closeRate: data.closeRate ? data.closeRate : 0,
      com: data.com ? data.com : 0,
    };
    const monthlyUpsertPromises = weeksInMonth.map((week) =>
      this.upsertWeeklyTarget(
        userId,
        week.weekStart,
        week.weekEnd,
        monthlyProratedData,
        "monthly"
      )
    );
    const monthlyResults = await Promise.all(monthlyUpsertPromises);
    return this._aggregateTargets(monthlyResults, queryType);
  }

  public async upsertTargetByPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: "weekly" | "monthly" | "yearly",
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[]> {
    switch (queryType) {
      case "weekly":
        return this.upsertWeeklyTarget(userId, startDate, endDate, data, "monthly");
        
      case "monthly":
        return this._upsertMonthlyTarget(
          userId,
          startDate,
          endDate,
          data,
          queryType
        );
      case "yearly":
        // Check if the provided date is in the current year and month or earlier
        const d = new Date(startDate);
        const now = new Date();
        const isPastOrCurrentMonth =
          d.getFullYear() < now.getFullYear() ||
          (d.getFullYear() === now.getFullYear() &&
            d.getMonth() <= now.getMonth());
        if (isPastOrCurrentMonth) {
          // Return a zero-filled target if the date is in the current or past month
          return this._aggregateTargets([], queryType);
        }
        return this._upsertMonthlyTarget(
          userId,
          startDate,
          endDate,
          data,
          queryType
        );
      default:
        throw new Error("Invalid queryType");
    }
  }

  public async getWeeklyTarget(
    userId: string,
    startDate: string,
    endDate?: string,
    queryType: string = "monthly"
  ): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekDetails(startDate);
    const target = await this.targetRepository.findTargetByStartDate(
      userId,
      weekInfo.weekStart,
      queryType
    );
    if (!target) {
      // Return an object with 0 values if no target is found
      return {
        userId,
        startDate: weekInfo.weekStart,
        endDate: weekInfo.weekEnd,
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: "",
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
      } as unknown as IWeeklyTargetDocument;
    }
    return target;
  }

  public async getAggregatedMonthlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    const weeksInMonth = DateUtils.getMonthWeeks(startDate, endDate);
    if (weeksInMonth.length === 0) {
      return [];
    }

    // Use getWeeklyTarget and pass start and enddate here
    const weeklyTargets = await Promise.all(
      weeksInMonth.map(week =>
        this.getWeeklyTarget(userId, week.weekStart, week.weekEnd)
      )
    );
    return weeklyTargets;
  }

  public async getAggregatedYearlyTarget(
    userId: string,
    startDate: string,
    endDate: string,
    queryType: string
  ): Promise<IWeeklyTargetDocument[]> {
    // Parse the year from startDate
    const year = new Date(startDate).getFullYear();
    const results: IWeeklyTargetDocument[] = [];
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      const monthEndStr = monthEnd.toISOString().slice(0, 10);
      // Get all weeks in this month
      const weeklyTargets = await this.getAggregatedMonthlyTarget(
        userId,
        monthStartStr,
        monthEndStr,
        "monthly"
      );
      let aggregated;
  if (weeklyTargets.length === 0) {
    aggregated = {
      userId,
      startDate: monthStartStr,
      endDate: monthEndStr,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      queryType: "monthly",
      year,
      weekNumber: 0,
    } as unknown as IWeeklyTargetDocument;
  } else {
    aggregated = this._aggregateTargets(weeklyTargets, "monthly");
    aggregated.year = year;
    aggregated.startDate = monthStartStr;
    aggregated.endDate = monthEndStr;
    aggregated.queryType = "monthly";
  }
  results.push(aggregated);
    }
    return results;
  }
}