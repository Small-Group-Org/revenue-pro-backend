import { TargetService } from "../services/target/service/service.js";
import utils from "../utils/utils.js";
export class TargetController {
    constructor() {
        this.service = new TargetService();
        this.upsertTarget = this.upsertTarget.bind(this);
        this.getTargets = this.getTargets.bind(this);
    }
    async upsertTarget(req, res) {
        try {
            const user = req.context.getUser();
            let userId;
            if (user && user.role === "ADMIN" && req.body.userId) {
                userId = req.body.userId;
            }
            else {
                userId = req.context.getUserId();
            }
            let targets;
            if (Array.isArray(req.body)) {
                targets = req.body;
                userId = targets[0].userId;
            }
            else {
                targets = [req.body];
            }
            const allowedFields = [
                "appointmentRate",
                "avgJobSize",
                "closeRate",
                "com",
                "revenue",
                "showRate",
                "startDate",
                "endDate",
                "queryType",
                "userId",
                "year",
                "weekNumber",
                "managementCost",
            ];
            const results = [];
            const errors = [];
            const isYearlyTargetArray = targets.length > 1 && targets.every(target => target.queryType === "yearly");
            if (isYearlyTargetArray) {
                for (let i = 0; i < targets.length; i++) {
                    const target = targets[i];
                    const { startDate, endDate, queryType, ...targetData } = target;
                    if (!startDate || !queryType) {
                        continue;
                    }
                    const filteredTargetData = {};
                    for (const key of allowedFields) {
                        if (key in targetData) {
                            filteredTargetData[key] = targetData[key];
                        }
                    }
                    try {
                        const result = await this.service.upsertTargetByPeriod(userId, startDate, endDate, "monthly", filteredTargetData);
                        result.map((weeklyData) => ({ ...weeklyData, queryType: "yearly" }));
                        results.push(result);
                    }
                    catch (err) {
                        console.error(`Error processing target ${i + 1}:`, err);
                        errors.push({
                            targetIndex: i,
                            error: err instanceof Error ? err.message : String(err),
                            stack: err instanceof Error ? err.stack : undefined
                        });
                    }
                }
            }
            else {
                // Process individual targets (weekly/monthly/single yearly)
                for (let i = 0; i < targets.length; i++) {
                    const target = targets[i];
                    const { startDate, endDate, queryType, ...targetData } = target;
                    if (!startDate || !queryType) {
                        continue;
                    }
                    const filteredTargetData = {};
                    for (const key of allowedFields) {
                        if (key in targetData) {
                            filteredTargetData[key] = targetData[key];
                        }
                    }
                    try {
                        // Handles weekly, monthly, and yearly upserts based on queryType
                        const result = await this.service.upsertTargetByPeriod(userId, startDate, endDate, queryType, filteredTargetData);
                        // Handle case where result might be an array (for yearly queryType)
                        if (Array.isArray(result)) {
                            results.push(...result);
                        }
                        else {
                            results.push(result);
                        }
                    }
                    catch (err) {
                        console.error(`Error processing target ${i + 1}:`, err);
                        errors.push({
                            targetIndex: i,
                            error: err instanceof Error ? err.message : String(err),
                            stack: err instanceof Error ? err.stack : undefined
                        });
                    }
                }
            }
            utils.sendSuccessResponse(res, 200, {
                success: true,
                data: results,
                errors,
            });
        }
        catch (error) {
            console.error("Error in upsertTarget:", error);
            console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
            utils.sendErrorResponse(res, error);
        }
    }
    async getTargets(req, res) {
        try {
            const { startDate, endDate, queryType } = req.query;
            const userIdRaw = req.query.userId;
            const userId = typeof userIdRaw === "string"
                ? userIdRaw
                : Array.isArray(userIdRaw)
                    ? userIdRaw[0]
                    : "";
            // Ensure startDate, endDate, and queryType are strings
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
            const queryTypeStr = typeof queryType === "string"
                ? queryType
                : Array.isArray(queryType)
                    ? queryType[0]
                    : "";
            if (typeof userId !== "string") {
                utils.sendErrorResponse(res, "Invalid userId");
                return;
            }
            if (!startDateStr || !queryTypeStr) {
                utils.sendErrorResponse(res, "startDate and type are required query parameters");
                return;
            }
            const validTypes = ["weekly", "monthly", "yearly"];
            if (!validTypes.includes(queryTypeStr)) {
                utils.sendErrorResponse(res, "type must be one of: weekly, monthly, yearly");
                return;
            }
            // Note: queryType is only used for timeframe determination
            // The response will include the target for each week in the timeframe (if it exists)
            // Since there can only be one target per week per user, no filtering by queryType is needed
            let results;
            switch (queryTypeStr) {
                case "weekly":
                    // For weekly, return array with a single object that contains the week
                    const weeklyTarget = await this.service.getWeeklyTarget(userId, startDateStr);
                    results = [weeklyTarget]; // Wrap in array as required
                    break;
                case "monthly":
                    // For monthly, return all weekly targets organized by months
                    const monthlyResults = await this.service.getAllWeeksOrganizedByMonths(userId, startDateStr, endDateStr, queryTypeStr);
                    // Monthly should return a single object in an array representing the month
                    // Since getAllWeeksOrganizedByMonths returns array of arrays, we take the first month
                    // and wrap it in an array to match the format: [monthWithWeeks]
                    results = monthlyResults.length > 0 ? [monthlyResults[0]] : [[]];
                    break;
                case "yearly":
                    if (!startDateStr) {
                        utils.sendErrorResponse(res, "startDate is required for yearly query");
                        return;
                    }
                    // For yearly queries, use the dedicated yearly function
                    results = await this.service.getYearlyTargetsOrganizedByMonths(userId, startDateStr, endDateStr, queryTypeStr);
                    break;
            }
            utils.sendSuccessResponse(res, 200, { success: true, data: results });
        }
        catch (error) {
            console.error("Error in getTargets:", error);
            utils.sendErrorResponse(res, error);
        }
    }
}
