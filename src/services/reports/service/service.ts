import Target from '../../target/repository/models/target.model.js';
import Actual from '../../actual/repository/models/actual.model.js';
import { safeDivide, calculatePerformance } from '../../../utils/caluculation.js';
import { IReportResult } from '../domain/report.domain.js';


export class ReportService {
  public async generate(timeframe: string, dateStr?: string): Promise<IReportResult> {
    const queryDate = dateStr ? new Date(dateStr) : new Date();

    let startDate: Date, endDate: Date;
    const year = queryDate.getFullYear();
    const month = queryDate.getMonth(); // 0-11

    switch (timeframe) {
      case 'weekly':
        const dayOfWeek = queryDate.getDay();
        const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startDate = new Date(queryDate);
        startDate.setDate(queryDate.getDate() + offset);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        startDate = new Date(year, month, 1);
        endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        break;
      case 'yearly':
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31, 23, 59, 59, 999);
        break;
      default:
        throw new Error('Invalid timeframe specified');
    }

    const targetData = await Target.findOne({ year });
    if (!targetData) throw new Error(`No targets found for the year ${year}`);

    const actualsData = await Actual.find({
      weekStartDate: { $gte: startDate, $lte: endDate },
    });

    const aggregatedActuals = actualsData.reduce(
      (acc, curr) => ({
        leads: acc.leads + curr.leads,
        estimatesSet: acc.estimatesSet + curr.estimatesSet,
        estimatesRan: acc.estimatesRan + curr.estimatesRan,
        jobsBooked: acc.jobsBooked + curr.jobsBooked,
        revenue: acc.revenue + curr.revenue,
        budgetSpent: acc.budgetSpent + curr.budgetSpent,
      }),
      { leads: 0, estimatesSet: 0, estimatesRan: 0, jobsBooked: 0, revenue: 0, budgetSpent: 0 }
    );

    const actuals = {
      ...aggregatedActuals,
      appointmentRate: safeDivide(aggregatedActuals.estimatesSet, aggregatedActuals.leads),
      showRate: safeDivide(aggregatedActuals.estimatesRan, aggregatedActuals.estimatesSet),
      closeRate: safeDivide(aggregatedActuals.jobsBooked, aggregatedActuals.estimatesRan),
      leadToSale: safeDivide(aggregatedActuals.jobsBooked, aggregatedActuals.leads),
      costPerLead: safeDivide(aggregatedActuals.budgetSpent, aggregatedActuals.leads),
      costPerEstimateSet: safeDivide(aggregatedActuals.budgetSpent, aggregatedActuals.estimatesSet),
      costPerJobBooked: safeDivide(aggregatedActuals.budgetSpent, aggregatedActuals.jobsBooked),
      avgJobSize: safeDivide(aggregatedActuals.revenue, aggregatedActuals.jobsBooked),
    };

    const monthlyTarget = targetData.monthly.find(m => m.month === month + 1);
    const relevantTargets = {
      leads: timeframe === 'yearly' ? targetData.monthly.reduce((sum, m) => sum + m.leads, 0) : monthlyTarget?.leads || 0,
      revenue: timeframe === 'yearly' ? targetData.monthly.reduce((sum, m) => sum + m.revenue, 0) : monthlyTarget?.revenue || 0,
      appointmentRate: targetData.appointmentRate,
      showRate: targetData.showRate,
      closeRate: targetData.closeRate,
      avgJobSize: monthlyTarget?.avgJobSize || 0,
      costPerLead: targetData.costPerLead,
      costPerEstimateSet: targetData.costPerEstimateSet,
      costPerJobBooked: targetData.costPerJobBooked,
      jobsBooked: 0,
    };
    relevantTargets.jobsBooked = relevantTargets.leads * relevantTargets.appointmentRate * relevantTargets.showRate * relevantTargets.closeRate;

    const performance = {
      revenue: calculatePerformance(actuals.revenue, relevantTargets.revenue),
      leads: calculatePerformance(actuals.leads, relevantTargets.leads),
      jobsBooked: calculatePerformance(actuals.jobsBooked, relevantTargets.jobsBooked),
      appointmentRate: calculatePerformance(actuals.appointmentRate, relevantTargets.appointmentRate),
      showRate: calculatePerformance(actuals.showRate, relevantTargets.showRate),
      closeRate: calculatePerformance(actuals.closeRate, relevantTargets.closeRate),
      avgJobSize: calculatePerformance(actuals.avgJobSize, relevantTargets.avgJobSize),
      costPerLead: calculatePerformance(relevantTargets.costPerLead, actuals.costPerLead),
      costPerEstimateSet: calculatePerformance(relevantTargets.costPerEstimateSet, actuals.costPerEstimateSet),
      costPerJobBooked: calculatePerformance(relevantTargets.costPerJobBooked, actuals.costPerJobBooked),
    };

    return {
      timeframe,
      dateRange: { startDate, endDate },
      targets: relevantTargets,
      actuals,
      performance,
    };
  }
}