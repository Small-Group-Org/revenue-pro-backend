import Target from '../../target/repository/models/target.model.js';
import Actual from '../../actual/repository/models/actual.model.js';
import { calculatePerformance } from '../../../utils/caluculation.js';
export class ReportService {
    async generate(timeframe, dateStr) {
        const queryDate = dateStr ? new Date(dateStr) : new Date();
        let startDate, endDate;
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
        if (!targetData)
            throw new Error(`No targets found for the year ${year}`);
        const actualsData = await Actual.find({
            startDate: { $gte: startDate, $lte: endDate },
        });
        // Aggregate actuals using only available fields
        const aggregatedActuals = actualsData.reduce((acc, curr) => ({
            appointmentRate: acc.appointmentRate,
            avgJobSize: acc.avgJobSize,
            closeRate: acc.closeRate,
            com: acc.com,
            revenue: acc.revenue,
            showRate: acc.showRate,
        }), { appointmentRate: 0, avgJobSize: 0, closeRate: 0, com: 0, revenue: 0, showRate: 0 });
        const actuals = { ...aggregatedActuals };
        // For targets, use only available fields from the model
        const relevantTargets = {
            appointmentRate: targetData.appointmentRate,
            avgJobSize: targetData.avgJobSize || 0,
            closeRate: targetData.closeRate,
            com: targetData.com || 0,
            revenue: targetData.revenue || 0,
            showRate: targetData.showRate,
        };
        // Performance calculation (example, adjust as needed)
        const performance = {
            revenue: calculatePerformance(actuals.revenue, relevantTargets.revenue),
            appointmentRate: calculatePerformance(actuals.appointmentRate, relevantTargets.appointmentRate),
            avgJobSize: calculatePerformance(actuals.avgJobSize, relevantTargets.avgJobSize),
            closeRate: calculatePerformance(actuals.closeRate, relevantTargets.closeRate),
            com: calculatePerformance(actuals.com, relevantTargets.com),
            showRate: calculatePerformance(actuals.showRate, relevantTargets.showRate),
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
