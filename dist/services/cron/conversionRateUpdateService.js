import cron from "node-cron";
import { LeadScoringService, LeadService } from "../leads/service/index.js";
import logger from "../../utils/logger.js";
import CronLogger from "../../utils/cronLogger.js";
import { MongoCronLogger } from "../../utils/mongoCronLogger.js";
export class ConversionRateUpdateService {
    constructor() {
        this.isRunning = false;
        this.currentLogId = null;
        this.leadScoringService = new LeadScoringService();
        this.leadService = new LeadService();
    }
    /**
     * Start the weekly cron job
     * Runs every Sunday at 2:00 AM
     * Performs comprehensive updates: conversion rates AND individual lead scores/conversionRates
     */
    startWeeklyCronJob() {
        // Cron schedule: "0 2 * * 0" = Every Sunday at 2:00 AM
        // For testing, you can use "*/5 * * * *" to run every 5 minutes
        const schedule = "0 2 * * 0";
        CronLogger.logCronJobStart(schedule);
        cron.schedule(schedule, async () => {
            if (this.isRunning) {
                CronLogger.logCronJobAlreadyRunning();
                return;
            }
            await this.runWeeklyUpdate();
        }, {
            timezone: "UTC" // Adjust timezone as needed
        });
        CronLogger.logCronJobStartSuccess();
    }
    /**
     * Run the weekly conversion rate and lead score update process
     */
    async runWeeklyUpdate() {
        this.isRunning = true;
        const startTime = new Date();
        // Log job start to MongoDB
        try {
            this.currentLogId = await MongoCronLogger.logCronJobStart({
                jobName: "weeklyLeadProcessor",
                details: "Starting weekly lead processing and conversion rate updates...",
                executionId: startTime.toISOString().replace(/[:.]/g, '-')
            });
        }
        catch (error) {
            logger.error("Failed to log cron job start:", error);
        }
        CronLogger.logWeeklyUpdateStart();
        try {
            const result = await this.runComprehensiveWeeklyUpdate();
            const duration = Date.now() - startTime.getTime();
            // Log success to MongoDB
            if (this.currentLogId) {
                try {
                    await MongoCronLogger.logCronJobSuccess({
                        logId: this.currentLogId,
                        details: {
                            message: "Weekly lead processing completed successfully",
                            processedClients: result.processedClients,
                            totalUpdatedConversionRates: result.totalUpdatedConversionRates,
                            totalUpdatedLeads: result.totalUpdatedLeads,
                            totalProcessedLeads: result.totalProcessedLeads,
                            errors: result.errors,
                            durationMs: duration,
                            breakdown: {
                                newLeads: 0, // This would need to be tracked in the actual processing
                                duplicatesRemoved: 0, // This would need to be tracked in the actual processing
                                conversionRatesUpdated: result.totalUpdatedConversionRates,
                                updatedLeads: result.totalUpdatedLeads,
                                totalProcessedLeads: result.totalProcessedLeads
                            }
                        },
                        processedCount: result.totalProcessedLeads
                    });
                }
                catch (error) {
                    logger.error("Failed to log cron job success:", error);
                }
            }
            CronLogger.logWeeklyUpdateCompletion({
                processedClients: result.processedClients,
                totalUpdatedConversionRates: result.totalUpdatedConversionRates,
                totalUpdatedLeads: result.totalUpdatedLeads,
                errors: result.errors,
                durationMs: duration
            });
        }
        catch (error) {
            // Log failure to MongoDB
            if (this.currentLogId) {
                try {
                    await MongoCronLogger.logCronJobFailure({
                        logId: this.currentLogId,
                        error: error.message || error.toString(),
                        details: {
                            message: "Weekly lead processing failed",
                            error: error.message || error.toString(),
                            stack: error.stack,
                            processedClients: 0,
                            totalUpdatedConversionRates: 0,
                            totalUpdatedLeads: 0
                        }
                    });
                }
                catch (logError) {
                    logger.error("Failed to log cron job failure:", logError);
                }
            }
            CronLogger.logFatalError(error);
        }
        finally {
            this.isRunning = false;
            this.currentLogId = null;
        }
    }
    async runComprehensiveWeeklyUpdate() {
        const startTime = new Date();
        const errors = [];
        const clientResults = [];
        let totalUpdatedConversionRates = 0;
        let totalUpdatedLeads = 0;
        let totalProcessedLeads = 0;
        try {
            // Get all client IDs
            const clientIds = await this.leadService.getAllClientIds();
            CronLogger.logComprehensiveUpdateStart(clientIds.length);
            for (const clientId of clientIds) {
                const clientStartTime = Date.now();
                try {
                    CronLogger.logClientUpdateStart(clientId);
                    // Use the comprehensive update method that handles both conversion rates AND lead updates
                    const result = await this.leadScoringService.processLeadScoresAndCRsByClientId(clientId);
                    totalUpdatedConversionRates += result.updatedConversionRates;
                    totalUpdatedLeads += result.updatedLeads;
                    totalProcessedLeads += result.totalProcessedLeads;
                    if (result.errors.length > 0) {
                        errors.push(...result.errors);
                    }
                    const duration = Date.now() - clientStartTime;
                    // Record client result
                    clientResults.push({
                        clientId,
                        success: result.errors.length === 0,
                        updatedConversionRates: result.updatedConversionRates,
                        updatedLeads: result.updatedLeads,
                        totalProcessedLeads: result.totalProcessedLeads,
                        errors: result.errors,
                        duration,
                        conversionRateStats: result.conversionRateStats
                    });
                    CronLogger.logClientUpdateCompletion(clientId, {
                        updatedConversionRates: result.updatedConversionRates,
                        updatedLeads: result.updatedLeads,
                        errors: result.errors.length,
                        duration
                    });
                }
                catch (error) {
                    const duration = Date.now() - clientStartTime;
                    const errorMsg = CronLogger.logClientUpdateError(clientId, error);
                    errors.push(errorMsg);
                    // Record failed client result
                    clientResults.push({
                        clientId,
                        success: false,
                        updatedConversionRates: 0,
                        updatedLeads: 0,
                        totalProcessedLeads: 0,
                        errors: [errorMsg],
                        duration,
                        conversionRateStats: {
                            newInserts: 0,
                            updated: 0
                        }
                    });
                }
            }
            // Calculate summary metrics
            const endTime = new Date();
            const duration = endTime.getTime() - startTime.getTime();
            // Log execution result to console
            logger.info("Weekly cron execution completed", {
                processedClients: clientIds.length,
                totalUpdatedConversionRates,
                totalUpdatedLeads,
                totalProcessedLeads,
                errors: errors.length,
                duration
            });
            return {
                processedClients: clientIds.length,
                totalUpdatedConversionRates,
                totalUpdatedLeads,
                totalProcessedLeads,
                errors
            };
        }
        catch (error) {
            const errorMsg = CronLogger.logComprehensiveUpdateError(error);
            errors.push(errorMsg);
            return {
                processedClients: 0,
                totalUpdatedConversionRates: 0,
                totalUpdatedLeads: 0,
                totalProcessedLeads: 0,
                errors
            };
        }
    }
    /**
     * Manual trigger for testing purposes
     */
    async triggerManualUpdate() {
        CronLogger.logManualTrigger();
        await this.runWeeklyUpdate();
        return await this.runComprehensiveWeeklyUpdate();
    }
    /**
     * Check if the cron job is currently running
     */
    isUpdateRunning() {
        return this.isRunning;
    }
    /**
     * Start a test cron job that runs every minute (for testing)
     * Performs comprehensive updates including conversion rates and lead scores
     */
    startTestCronJob() {
        CronLogger.logTestCronJobStart();
        cron.schedule("*/1 * * * *", async () => {
            CronLogger.logTestCronJobExecution();
            if (!this.isRunning) {
                await this.runWeeklyUpdate();
            }
        });
    }
    /**
     * Get cron job statistics from MongoDB
     */
    async getCronJobStats(days = 30) {
        return await MongoCronLogger.getCronJobStats("weeklyLeadProcessor", days);
    }
    /**
     * Get recent cron job logs
     */
    async getRecentLogs(limit = 10) {
        return await MongoCronLogger.getRecentLogs("weeklyLeadProcessor", limit);
    }
    /**
     * Cleanup old cron job logs
     */
    async cleanupOldLogs(keepCount = 100) {
        return await MongoCronLogger.cleanupOldLogs("weeklyLeadProcessor", keepCount);
    }
}
// Singleton instance
export default new ConversionRateUpdateService();
