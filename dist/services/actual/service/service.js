import { ActualRepository } from "../repository/repository.js";
import { DateUtils } from "../../../utils/date.utils.js";
export class ActualService {
    constructor() {
        this.actualRepository = new ActualRepository();
    }
    async getActualYearlyMonthlyAggregate(userId, year) {
        const results = [];
        for (let month = 0; month < 12; month++) {
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0);
            const monthStartStr = monthStart.toISOString().slice(0, 10);
            const monthEndStr = monthEnd.toISOString().slice(0, 10);
            const weeks = DateUtils.getMonthWeeks(monthStartStr, monthEndStr);
            const weeklyActuals = await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
                const actual = await this.actualRepository.findActualByStartDate(userId, weekStart);
                return actual
                    ? actual.toObject()
                    : this._zeroFilledActual(weekStart, weekEnd, userId);
            }));
            let aggregated;
            if (weeklyActuals.length === 0) {
                aggregated = this._zeroFilledActual(monthStartStr, monthEndStr, userId);
            }
            else {
                aggregated = weeklyActuals.reduce((acc, curr) => {
                    acc.testingBudgetSpent += curr.testingBudgetSpent || 0;
                    acc.awarenessBrandingBudgetSpent += curr.awarenessBrandingBudgetSpent || 0;
                    acc.leadGenerationBudgetSpent += curr.leadGenerationBudgetSpent || 0;
                    // Sum metaBudgetSpent, but preserve null if all values are null
                    if (acc.metaBudgetSpent === null && curr.metaBudgetSpent === null) {
                        acc.metaBudgetSpent = null;
                    }
                    else {
                        acc.metaBudgetSpent = (acc.metaBudgetSpent ?? 0) + (curr.metaBudgetSpent ?? 0);
                    }
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
    _zeroFilledActual(startDate, endDate, userId) {
        return {
            userId,
            startDate,
            endDate,
            testingBudgetSpent: 0,
            awarenessBrandingBudgetSpent: 0,
            leadGenerationBudgetSpent: 0,
            metaBudgetSpent: null,
            revenue: 0,
            sales: 0,
            leads: 0,
            estimatesRan: 0,
            estimatesSet: 0,
            adNamesAmount: [],
        };
    }
    async upsertActualWeekly(userId, startDate, endDate, data) {
        const week = DateUtils.getWeekDetails(startDate);
        // Validate metaBudgetSpent if provided
        if (data.metaBudgetSpent !== undefined && data.metaBudgetSpent !== null) {
            if (typeof data.metaBudgetSpent !== 'number' || data.metaBudgetSpent < 0) {
                throw new Error('metaBudgetSpent must be a non-negative number');
            }
        }
        const payload = {
            userId,
            startDate: week.weekStart,
            endDate: week.weekEnd,
            testingBudgetSpent: data.testingBudgetSpent ?? 0,
            awarenessBrandingBudgetSpent: data.awarenessBrandingBudgetSpent ?? 0,
            leadGenerationBudgetSpent: data.leadGenerationBudgetSpent ?? 0,
            metaBudgetSpent: data.metaBudgetSpent !== undefined ? data.metaBudgetSpent : null,
            revenue: data.revenue ?? 0,
            sales: data.sales ?? 0,
            leads: data.leads ?? 0,
            estimatesRan: data.estimatesRan ?? 0,
            estimatesSet: data.estimatesSet ?? 0,
            adNamesAmount: data.adNamesAmount ?? [],
        };
        const existing = await this.actualRepository.findActualByStartDate(userId, week.weekStart);
        let actual;
        if (existing) {
            actual = await this.actualRepository.updateActual({
                ...existing.toObject(),
                ...payload,
            });
        }
        else {
            actual = await this.actualRepository.createActual(payload);
        }
        if (!actual)
            throw new Error("Upsert failed for actual data");
        return actual;
    }
    async getActualWeekly(userId, date) {
        const week = DateUtils.getWeekDetails(date);
        const actual = await this.actualRepository.findActualByStartDate(userId, week.weekStart);
        return actual
            ? actual.toObject()
            : this._zeroFilledActual(week.weekStart, week.weekEnd, userId);
    }
    async getActualMonthly(userId, startDate, endDate) {
        const weeks = DateUtils.getMonthWeeks(startDate, endDate);
        return await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
            const actual = await this.actualRepository.findActualByStartDate(userId, weekStart);
            return actual
                ? actual.toObject()
                : this._zeroFilledActual(weekStart, weekEnd, userId);
        }));
    }
    async getActualYearly(userId, year) {
        const weeks = DateUtils.getYearWeeks(year);
        return await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
            const actual = await this.actualRepository.findActualByStartDate(userId, weekStart);
            return actual
                ? actual.toObject()
                : this._zeroFilledActual(weekStart, weekEnd, userId);
        }));
    }
    async getActualsByDateRange(userId, startDate, endDate) {
        const weeks = DateUtils.getMonthWeeks(startDate, endDate);
        return await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
            const actual = await this.actualRepository.findActualByStartDate(userId, weekStart);
            return actual
                ? actual.toObject()
                : this._zeroFilledActual(weekStart, weekEnd, userId);
        }));
    }
    async getActualByPeriod(userId, startDate, endDate, type) {
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
    async getAggregatedActualsForAllUsers(startDateStr, endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        // Check if it's a full year
        const isFullYear = start.getMonth() === 0 &&
            start.getDate() === 1 &&
            end.getMonth() === 11 &&
            (end.getDate() === 31 ||
                (end.getMonth() === 11 &&
                    new Date(end.getFullYear(), 11, 31).getDate() === end.getDate())) &&
            start.getFullYear() === end.getFullYear();
        if (isFullYear) {
            // Return 12 monthly aggregates for all users
            return await this.getActualYearlyMonthlyAggregateForAllUsers(start.getFullYear());
        }
        else {
            // Return date range aggregate for all users
            return await this.getActualsByDateRangeForAllUsers(startDateStr, endDateStr);
        }
    }
    /**
     * Get actual data by date range for ALL users (aggregated)
     * Same structure as getActualsByDateRange but summed across all users
     */
    async getActualsByDateRangeForAllUsers(startDateStr, endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        // Get all weeks in the date range
        const weeks = DateUtils.getMonthWeeks(startDateStr, endDateStr);
        // For each week, aggregate data from all users
        const aggregatedWeeks = await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
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
            const aggregated = {
                userId: "ALL_USERS",
                startDate: weekStart,
                endDate: weekEnd,
                testingBudgetSpent: actuals.reduce((sum, a) => sum + (a.testingBudgetSpent || 0), 0),
                awarenessBrandingBudgetSpent: actuals.reduce((sum, a) => sum + (a.awarenessBrandingBudgetSpent || 0), 0),
                leadGenerationBudgetSpent: actuals.reduce((sum, a) => sum + (a.leadGenerationBudgetSpent || 0), 0),
                metaBudgetSpent: (() => {
                    const hasAnyValue = actuals.some(a => a.metaBudgetSpent !== null && a.metaBudgetSpent !== undefined);
                    if (!hasAnyValue)
                        return null;
                    return actuals.reduce((sum, a) => sum + (a.metaBudgetSpent ?? 0), 0);
                })(),
                revenue: actuals.reduce((sum, a) => sum + (a.revenue || 0), 0),
                sales: actuals.reduce((sum, a) => sum + (a.sales || 0), 0),
                leads: actuals.reduce((sum, a) => sum + (a.leads || 0), 0),
                estimatesRan: actuals.reduce((sum, a) => sum + (a.estimatesRan || 0), 0),
                estimatesSet: actuals.reduce((sum, a) => sum + (a.estimatesSet || 0), 0),
                adNamesAmount: [], // Don't aggregate ad names for now
            };
            return aggregated;
        }));
        return aggregatedWeeks;
    }
    /**
     * Get yearly monthly aggregate for ALL users
     * Returns 12 months of data (Jan-Dec) with all users aggregated
     */
    async getActualYearlyMonthlyAggregateForAllUsers(year) {
        const results = [];
        for (let month = 0; month < 12; month++) {
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0);
            const monthStartStr = monthStart.toISOString().slice(0, 10);
            const monthEndStr = monthEnd.toISOString().slice(0, 10);
            const weeks = DateUtils.getMonthWeeks(monthStartStr, monthEndStr);
            // Get all actuals for all weeks in this month across all users
            const weeklyActuals = await Promise.all(weeks.map(async ({ weekStart, weekEnd }) => {
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
                    testingBudgetSpent: actuals.reduce((sum, a) => sum + (a.testingBudgetSpent || 0), 0),
                    awarenessBrandingBudgetSpent: actuals.reduce((sum, a) => sum + (a.awarenessBrandingBudgetSpent || 0), 0),
                    leadGenerationBudgetSpent: actuals.reduce((sum, a) => sum + (a.leadGenerationBudgetSpent || 0), 0),
                    metaBudgetSpent: (() => {
                        const hasAnyValue = actuals.some(a => a.metaBudgetSpent !== null && a.metaBudgetSpent !== undefined);
                        if (!hasAnyValue)
                            return null;
                        return actuals.reduce((sum, a) => sum + (a.metaBudgetSpent ?? 0), 0);
                    })(),
                    revenue: actuals.reduce((sum, a) => sum + (a.revenue || 0), 0),
                    sales: actuals.reduce((sum, a) => sum + (a.sales || 0), 0),
                    leads: actuals.reduce((sum, a) => sum + (a.leads || 0), 0),
                    estimatesRan: actuals.reduce((sum, a) => sum + (a.estimatesRan || 0), 0),
                    estimatesSet: actuals.reduce((sum, a) => sum + (a.estimatesSet || 0), 0),
                    adNamesAmount: [],
                };
            }));
            // Aggregate all weeks in this month
            let aggregated;
            if (weeklyActuals.length === 0) {
                aggregated = this._zeroFilledActual(monthStartStr, monthEndStr, "ALL_USERS");
            }
            else {
                aggregated = weeklyActuals.reduce((acc, curr) => {
                    acc.testingBudgetSpent += curr.testingBudgetSpent || 0;
                    acc.awarenessBrandingBudgetSpent += curr.awarenessBrandingBudgetSpent || 0;
                    acc.leadGenerationBudgetSpent += curr.leadGenerationBudgetSpent || 0;
                    // Sum metaBudgetSpent, but preserve null if all values are null
                    if (acc.metaBudgetSpent === null && curr.metaBudgetSpent === null) {
                        acc.metaBudgetSpent = null;
                    }
                    else {
                        acc.metaBudgetSpent = (acc.metaBudgetSpent ?? 0) + (curr.metaBudgetSpent ?? 0);
                    }
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
    async getUsersRevenueByDateRange(startDate, endDate) {
        const revenueData = await this.actualRepository.getUsersRevenueByDateRange(startDate, endDate);
        return revenueData;
    }
    /**
     * Update weekly reporting data
     */
    async updateWeeklyReporting(userId, startDate, updateData) {
        // Validate that at least one field is provided
        if (updateData.revenue === undefined &&
            updateData.leads === undefined &&
            updateData.estimatesRan === undefined &&
            updateData.estimatesSet === undefined &&
            updateData.sales === undefined) {
            throw new Error("At least one field must be provided for update");
        }
        // Validate numeric values
        Object.entries(updateData).forEach(([key, value]) => {
            if (value !== undefined && (typeof value !== "number" || value < 0)) {
                throw new Error(`${key} must be a non-negative number`);
            }
        });
        const updated = await this.actualRepository.updateWeeklyReporting(userId, startDate, updateData);
        if (!updated) {
            throw new Error("Failed to update weekly reporting data");
        }
        return updated;
    }
}
