import { IWeeklyTarget } from '../domain/target.domain.js';
import { IWeeklyTargetDocument } from '../repository/models/target.model.js';
import { TargetRepository } from '../repository/repository.js';
import { DateUtils } from '../../../utils/date.utils.js';

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
  }

  private _aggregateTargets(targets: IWeeklyTargetDocument[], queryType:string): IWeeklyTargetDocument {
    if (targets.length === 0) {
      return {
        userId: '',
        startDate: new Date(),
        endDate: new Date(),
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: queryType,
        year: new Date().getFullYear(),
        weekNumber: 0
      } as IWeeklyTargetDocument;
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
      queryType: targets[0].queryType || '',
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

  public async upsertWeeklyTarget(userId: string, date: Date, data: Partial<IWeeklyTarget>, queryType: string): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekInfo(date);
    const defaultTarget: IWeeklyTarget = {
      userId,
      startDate: weekInfo.startDate,
      endDate: weekInfo.endDate,
      year: weekInfo.year,
      weekNumber: weekInfo.weekNumber,
      appointmentRate: 0,
      avgJobSize: 0,
      closeRate: 0,
      com: 0,
      revenue: 0,
      showRate: 0,
      queryType: queryType,
    };

    // Try to find an existing target
    const existingTarget = await this.targetRepository.findTargetByStartDate(userId, weekInfo.startDate);

    let target: IWeeklyTargetDocument | null;
    if (existingTarget) {
      // If target exists, update it
      target = await this.targetRepository.updateTarget({ ...existingTarget.toObject(), ...data, queryType });
    } else {
      // If no target exists, create a new one
      target = await this.targetRepository.createTarget({ ...defaultTarget, ...data, queryType });
    }

    if (!target) throw new Error('Failed to update or create weekly target.');
    return target;
  }

  private async _upsertMonthlyTarget(userId: string, date: Date, data: Partial<IWeeklyTarget>, queryType:string): Promise<IWeeklyTargetDocument> {
    const weeksInMonth = DateUtils.getWeeksInMonth(date.getFullYear(), date.getMonth() + 1);
    if (weeksInMonth.length === 0) {
      return this._aggregateTargets([], queryType);
    }
    const monthlyProratedData: Partial<IWeeklyTarget> = {
      ...data,
      revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
      avgJobSize: data.avgJobSize ? data.avgJobSize: 0,
      appointmentRate: data.appointmentRate ? data.appointmentRate  : 0,
      showRate: data.showRate ? data.showRate : 0,
      closeRate: data.closeRate ? data.closeRate  : 0,
      com: data.com ? data.com : 0,
    };
    const monthlyUpsertPromises = weeksInMonth.map(week =>
      this.upsertWeeklyTarget(userId, week.startDate, monthlyProratedData, 'monthly')
    );
    const monthlyResults = await Promise.all(monthlyUpsertPromises);
    return this._aggregateTargets(monthlyResults, queryType);
  }

  public async upsertTargetByPeriod(
    userId: string,
    date: Date,
    queryType: 'monthly' | 'yearly',
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument | IWeeklyTargetDocument[]> {
    switch (queryType) {
      case 'monthly':
        return this._upsertMonthlyTarget(userId, date, data, queryType);
      case 'yearly':
        /**
         * For 'yearly' queryType, returns an array of monthly target results (not aggregated).
         * The return type for this case is Promise<IWeeklyTargetDocument[]>.
         */
        const currentYear = date.getFullYear();
        const now = new Date();
        const thisYear = now.getFullYear();
        let months: number[] = [];
        if (currentYear < thisYear) {
          // If the year is before the current year, return empty array
          return [];
        } else if (currentYear === thisYear) {
          // Only include months from current month to December
          const startMonth = now.getMonth(); // 0-based
          months = Array.from({ length: 12 - startMonth }, (_, i) => i + startMonth);
        } else {
          // For future years, include all months
          months = Array.from({ length: 12 }, (_, i) => i);
        }
        const yearlyUpsertPromises = months.map(monthIdx => {
          const monthDate = new Date(date.getFullYear(), monthIdx, 1);
          return this._upsertMonthlyTarget(userId, monthDate, data, queryType);
        });
        const yearlyResults = await Promise.all(yearlyUpsertPromises);
        return yearlyResults;
      default:
        throw new Error('Invalid queryType');
    }
  }

  public async getWeeklyTarget(userId: string, date: Date): Promise<IWeeklyTargetDocument> {
    const weekInfo = DateUtils.getWeekInfo(date);
    const target = await this.targetRepository.findTargetByStartDate(userId, weekInfo.startDate);
    if (!target) {
      // Return an object with 0 values if no target is found
      return {
        userId,
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate,
        appointmentRate: 0,
        avgJobSize: 0,
        closeRate: 0,
        com: 0,
        revenue: 0,
        showRate: 0,
        queryType: '',
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber
      } as IWeeklyTargetDocument;
    }
    return target;
  }

  public async getAggregatedMonthlyTarget(userId: string, year: number, month: number, queryType:string): Promise<IWeeklyTargetDocument> {
    const weeksInMonth = DateUtils.getWeeksInMonth(year, month);
    if (weeksInMonth.length === 0) {
      return this._aggregateTargets([], queryType); // Return zero-filled object if no weeks found
    }
    const firstWeekStartDate = weeksInMonth[0].startDate;
    const lastWeekEndDate = weeksInMonth[weeksInMonth.length - 1].endDate;
    const weeklyTargets = await this.targetRepository.getTargetsByDateRangeAndQueryType(
      firstWeekStartDate,
      lastWeekEndDate,
      userId,
      queryType
    );
    return this._aggregateTargets(weeklyTargets, queryType);
  }

  public async getAggregatedYearlyTarget(userId: string, year: number, queryType: string): Promise<IWeeklyTargetDocument[]> {
    const results: IWeeklyTargetDocument[] = [];
    for (let month = 1; month <= 12; month++) {
      const monthlyTarget = await this.getAggregatedMonthlyTarget(userId, year, month, queryType);
      results.push(monthlyTarget);
    }
    return results;
  }
}