import WeeklyActual from "./models/actual.model.js";
export class ActualRepository {
    constructor() {
        this.model = WeeklyActual;
    }
    async createActual(data) {
        const res = await this.model.create(data);
        return res;
    }
    async updateActual(data) {
        const res = await this.model.findOneAndUpdate({ userId: data.userId, startDate: data.startDate }, data, { new: true, upsert: true, setDefaultsOnInsert: true });
        return res;
    }
    async getActualsByDateRange(startDate, endDate, userId) {
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
    async findActualByStartDate(userId, startDate) {
        return await this.model.findOne({ userId, startDate });
    }
    /**
     * Fetches each week's actual data for a given user and month.
     * @param userId - The user ID
     * @param weeksInMonth - Array of week info objects (with startDate)
     * @returns Array of IWeeklyActualDocument (may include nulls if not found)
     */
    async getMonthlyActualsByWeeks(userId, weeksInMonth) {
        return Promise.all(weeksInMonth.map((week) => this.model.findOne({ userId, startDate: week.startDate })));
    }
    /**
     * Aggregate latest weekly report updates per client (userId)
     * Returns data sorted by latest update first (most recent to oldest/never updated)
     */
    async aggregateWeeklyActivity() {
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
    async findActualsByQuery(query) {
        return await this.model.find(query).sort({ startDate: 1 });
    }
    /**
     * Get users with their total revenue for a date range
     * @param startDate - Start date in ISO format
     * @param endDate - End date in ISO format
     * @returns Array of objects with userId, userName, userEmail, and totalRevenue
     */
    async getUsersRevenueByDateRange(startDate, endDate) {
        const result = await this.model.aggregate([
            {
                $match: {
                    startDate: {
                        $gte: startDate,
                        $lte: endDate,
                    },
                    userId: { $ne: "68bc48591d96640540bef437" },
                },
            },
            {
                $group: {
                    _id: "$userId",
                    totalRevenue: { $sum: "$revenue" },
                    testingBudgetSpent: { $sum: "$testingBudgetSpent" },
                    awarenessBrandingBudgetSpent: { $sum: "$awarenessBrandingBudgetSpent" },
                    leadGenerationBudgetSpent: { $sum: "$leadGenerationBudgetSpent" },
                    actualLeads: { $sum: "$leads" },
                    actualEstimateSet: { $sum: "$estimatesSet" },
                },
            },
            {
                $addFields: {
                    userObjectId: { $toObjectId: "$_id" },
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userObjectId",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: {
                    path: "$userDetails",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $match: {
                    $or: [
                        { "userDetails.role": { $ne: "ADMIN" } },
                        { "userDetails": { $exists: false } },
                    ],
                },
            },
            {
                $lookup: {
                    from: "leads",
                    let: { clientId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$clientId", "$$clientId"] },
                                        { $gte: ["$leadDate", startDate] },
                                        { $lte: ["$leadDate", endDate] },
                                        { $ne: ["$isDeleted", true] },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "leads",
                },
            },
            {
                $addFields: {
                    totalBudgetSpent: {
                        $add: ["$testingBudgetSpent", "$awarenessBrandingBudgetSpent", "$leadGenerationBudgetSpent"]
                    },
                    estimateSetCount: {
                        $size: {
                            $filter: {
                                input: "$leads",
                                as: "lead",
                                cond: {
                                    $in: [
                                        "$$lead.status",
                                        ["estimate_set", "virtual_quote", "proposal_presented", "job_booked"]
                                    ]
                                },
                            },
                        },
                    },
                    disqualifiedLeadsCount: {
                        $size: {
                            $filter: {
                                input: "$leads",
                                as: "lead",
                                cond: {
                                    $in: [
                                        "$$lead.status",
                                        ["unqualified", "estimate_canceled", "job_lost"]
                                    ]
                                },
                            },
                        },
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    userId: "$_id",
                    userName: { $ifNull: ["$userDetails.name", "Unknown User"] },
                    userEmail: { $ifNull: ["$userDetails.email", ""] },
                    totalRevenue: 1,
                    testingBudgetSpent: 1,
                    awarenessBrandingBudgetSpent: 1,
                    leadGenerationBudgetSpent: 1,
                    totalBudgetSpent: 1,
                    estimateSetCount: 1,
                    disqualifiedLeadsCount: 1,
                    actualLeads: 1,
                    actualEstimateSet: 1,
                },
            },
            {
                $sort: { totalRevenue: -1 },
            },
        ]);
        return result;
    }
    /**
     * Update weekly reporting data (revenue, leads, estimates, sales)
     * @param userId - User ID
     * @param startDate - Week start date
     * @param updateData - Data to update
     * @returns Updated weekly actual document
     */
    async updateWeeklyReporting(userId, startDate, updateData) {
        const res = await this.model.findOneAndUpdate({ userId, startDate }, { $set: updateData }, { new: true, upsert: true, setDefaultsOnInsert: true });
        return res;
    }
}
