import { ActualService } from '../services/actual/service/service.js';
import { TargetService } from '../services/target/service/service.js';
import { leadAnalyticsService } from '../services/leads/service/index.js';
/**
 * Master Aggregate Controller
 * Handles requests for aggregated data across ALL users
 */
export class AggregateController {
    constructor() {
        this.actualService = new ActualService();
        this.targetService = new TargetService();
        this.getAggregatedReport = this.getAggregatedReport.bind(this);
    }
    /**
     * Get both actual and target data aggregated across ALL users
     * Same structure as getActualAndTargetReport but for all users combined
     *
     * Expects: startDate, endDate, queryType (weekly/monthly/yearly) as query params
     * Returns: { actual: [...], target: [...] }
     */
    async getAggregatedReport(req, res) {
        try {
            const { startDate, endDate, queryType } = req.query;
            const startDateStr = typeof startDate === "string"
                ? startDate
                : Array.isArray(startDate)
                    ? startDate[0]
                    : "";
            const endDateStr = typeof endDate === "string"
                ? endDate
                : Array.isArray(endDate)
                    ? endDate[0]
                    : "";
            if (!startDateStr || !endDateStr || !queryType) {
                res.status(400).json({
                    success: false,
                    message: "startDate, endDate, and queryType are required query parameters"
                });
                return;
            }
            // Validate queryType
            if (!['weekly', 'monthly', 'yearly'].includes(String(queryType))) {
                res.status(400).json({
                    success: false,
                    message: "queryType must be 'weekly', 'monthly', or 'yearly'"
                });
                return;
            }
            // Get aggregated actuals (same logic as individual user)
            const start = new Date(String(startDateStr));
            const end = new Date(String(endDateStr));
            const isFullYear = start.getMonth() === 0 &&
                start.getDate() === 1 &&
                end.getMonth() === 11 &&
                (end.getDate() === 31 ||
                    (end.getMonth() === 11 &&
                        new Date(end.getFullYear(), 11, 31).getDate() === end.getDate())) &&
                start.getFullYear() === end.getFullYear();
            let actualResults;
            if (isFullYear) {
                actualResults = await this.actualService.getAggregatedActualsForAllUsers(String(startDateStr), String(endDateStr));
            }
            else {
                actualResults = await this.actualService.getAggregatedActualsForAllUsers(String(startDateStr), String(endDateStr));
            }
            // Get aggregated targets
            const targetResults = await this.targetService.getAggregatedTargetsForAllUsers(String(startDateStr), String(endDateStr), String(queryType));
            // Get users revenue breakdown
            const usersBudgetAndRevenue = await this.actualService.getUsersRevenueByDateRange(String(startDateStr), String(endDateStr));
            // Get aggregated lead analytics
            const leadAnalytics = await leadAnalyticsService.getAggregatedLeadAnalytics(String(startDateStr), String(endDateStr));
            res.status(200).json({
                success: true,
                data: {
                    actual: actualResults,
                    target: Array.isArray(targetResults) ? targetResults : [targetResults],
                    usersBudgetAndRevenue: usersBudgetAndRevenue,
                    leadAnalytics: leadAnalytics
                }
            });
        }
        catch (error) {
            console.error("Error in getAggregatedReport:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}
