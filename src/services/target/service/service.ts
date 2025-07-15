import { IWeeklyTarget } from '../domain/target.domain.js';
import { IWeeklyTargetDocument } from '../repository/models/target.model.js';
import { TargetRepository } from '../repository/repository.js';
import { DateUtils } from '../../../utils/date.utils.js';

export class TargetService {
  private targetRepository: TargetRepository;

  constructor() {
    this.targetRepository = new TargetRepository();
  }

  public async upsertWeeklyTarget(userId: string, date: Date, data: Partial<IWeeklyTarget>): Promise<IWeeklyTargetDocument> {
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
      queryType: 'weekly',
    };

    // Try to find an existing target
    const existingTarget = await this.targetRepository.findTargetByStartDate(userId, weekInfo.startDate);

    let target: IWeeklyTargetDocument | null;
    if (existingTarget) {
      // If target exists, update it
      target = await this.targetRepository.updateTarget({ ...existingTarget.toObject(), ...data });
    } else {
      // If no target exists, create a new one
      target = await this.targetRepository.createTarget({ ...defaultTarget, ...data });
    }

    if (!target) throw new Error('Failed to update or create weekly target.');
    return target;
  }

  private _aggregateTargets(targets: IWeeklyTargetDocument[]): IWeeklyTargetDocument {
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
        queryType: '',
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
      aggregated.avgJobSize += target.avgJobSize || 0;
      aggregated.appointmentRate += target.appointmentRate || 0;
      aggregated.showRate += target.showRate || 0;
      aggregated.closeRate += target.closeRate || 0;
      aggregated.com += target.com || 0;
    }

    return aggregated as IWeeklyTargetDocument;
  }

  public async upsertTargetByPeriod(
    userId: string,
    date: Date,
    queryType: 'weekly' | 'monthly' | 'yearly',
    data: Partial<IWeeklyTarget>
  ): Promise<IWeeklyTargetDocument> {
    switch (queryType) {
      case 'weekly':
        return this.upsertWeeklyTarget(userId, date, data);
      case 'monthly':
        const weeksInMonth = DateUtils.getWeeksInMonth(date.getFullYear(), date.getMonth() + 1);
        if (weeksInMonth.length === 0) {
          return this._aggregateTargets([]);
        }
        const monthlyProratedData: Partial<IWeeklyTarget> = {
          ...data,
          revenue: data.revenue ? data.revenue / weeksInMonth.length : 0,
          avgJobSize: data.avgJobSize ? data.avgJobSize / weeksInMonth.length : 0,
          appointmentRate: data.appointmentRate ? data.appointmentRate / weeksInMonth.length : 0,
          showRate: data.showRate ? data.showRate / weeksInMonth.length : 0,
          closeRate: data.closeRate ? data.closeRate / weeksInMonth.length : 0,
          com: data.com ? data.com / weeksInMonth.length : 0,
        };
        const monthlyUpsertPromises = weeksInMonth.map(week =>
          this.upsertWeeklyTarget(userId, week.startDate, monthlyProratedData)
        );
        const monthlyResults = await Promise.all(monthlyUpsertPromises);
        return this._aggregateTargets(monthlyResults);
      case 'yearly':
        const weeksInYear = DateUtils.getWeeksInYear(date.getFullYear());
        if (weeksInYear.length === 0) {
          return this._aggregateTargets([]);
        }
        const yearlyProratedData: Partial<IWeeklyTarget> = {
          ...data,
          revenue: data.revenue ? data.revenue / weeksInYear.length : 0,
          avgJobSize: data.avgJobSize ? data.avgJobSize / weeksInYear.length : 0,
          appointmentRate: data.appointmentRate ? data.appointmentRate / weeksInYear.length : 0,
          showRate: data.showRate ? data.showRate / weeksInYear.length : 0,
          closeRate: data.closeRate ? data.closeRate / weeksInYear.length : 0,
          com: data.com ? data.com / weeksInYear.length : 0,
        };
        const yearlyUpsertPromises = weeksInYear.map(week =>
          this.upsertWeeklyTarget(userId, week.startDate, yearlyProratedData)
        );
        const yearlyResults = await Promise.all(yearlyUpsertPromises);
        return this._aggregateTargets(yearlyResults);
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

  public async getAggregatedMonthlyTarget(userId: string, year: number, month: number): Promise<IWeeklyTargetDocument> {
    const weeksInMonth = DateUtils.getWeeksInMonth(year, month);
    if (weeksInMonth.length === 0) {
      return this._aggregateTargets([]); // Return zero-filled object if no weeks found
    }
    const firstWeekStartDate = weeksInMonth[0].startDate;
    const lastWeekEndDate = weeksInMonth[weeksInMonth.length - 1].endDate;
    const weeklyTargets = await this.targetRepository.getTargetsByDateRange(
      firstWeekStartDate,
      lastWeekEndDate,
      userId
    );
    return this._aggregateTargets(weeklyTargets);
  }

  public async getAggregatedYearlyTarget(userId: string, year: number): Promise<IWeeklyTargetDocument> {
    const weeksInYear = DateUtils.getWeeksInYear(year);
    if (weeksInYear.length === 0) {
      return this._aggregateTargets([]); // Return zero-filled object if no weeks found
    }
    const firstWeekStartDate = weeksInYear[0].startDate;
    const lastWeekEndDate = weeksInYear[weeksInYear.length - 1].endDate;
    const weeklyTargets = await this.targetRepository.getTargetsByDateRange(
      firstWeekStartDate,
      lastWeekEndDate,
      userId
    );
    return this._aggregateTargets(weeklyTargets);
  }
}