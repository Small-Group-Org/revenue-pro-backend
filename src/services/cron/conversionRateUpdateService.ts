import cron from "node-cron";
import { LeadService } from "../leads/service/service.js";
import logger from "../../utils/logger.js";
import CronLogger from "../../utils/cronLogger.js";
import { MongoCronLogger } from "../../utils/mongoCronLogger.js";
import { ObjectId } from "mongoose";

export class ConversionRateUpdateService {
  private leadService: LeadService;
  private isRunning: boolean = false;
  private currentLogId: ObjectId | null = null;

  constructor() {
    this.leadService = new LeadService();
  }

  /**
   * Start the weekly cron job
   * Runs every Sunday at 2:00 AM
   * Performs comprehensive updates: conversion rates AND individual lead scores/conversionRates
   */
  public startWeeklyCronJob(): void {
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
  public async runWeeklyUpdate(): Promise<void> {
    this.isRunning = true;
    const startTime = new Date();
    
    // Log job start to MongoDB
    try {
      this.currentLogId = await MongoCronLogger.logCronJobStart({
        jobName: "weeklyLeadProcessor",
        details: "Starting weekly lead processing and conversion rate updates...",
        executionId: startTime.toISOString().replace(/[:.]/g, '-')
      });
    } catch (error: any) {
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
              errors: result.errors,
              durationMs: duration,
              breakdown: {
                newLeads: 0, // This would need to be tracked in the actual processing
                duplicatesRemoved: 0, // This would need to be tracked in the actual processing
                conversionRatesUpdated: result.totalUpdatedConversionRates,
                leadsUpdated: result.totalUpdatedLeads
              }
            },
            processedCount: result.totalUpdatedLeads
          });
        } catch (error: any) {
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
      
    } catch (error: any) {
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
        } catch (logError: any) {
          logger.error("Failed to log cron job failure:", logError);
        }
      }
      
      CronLogger.logFatalError(error);
    } finally {
      this.isRunning = false;
      this.currentLogId = null;
    }
  }

  private async runComprehensiveWeeklyUpdate(): Promise<{
    processedClients: number;
    totalUpdatedConversionRates: number;
    totalUpdatedLeads: number;
    errors: string[];
  }> {
    const startTime = new Date();
    const errors: string[] = [];
    const clientResults: Array<{
      clientId: string;
      success: boolean;
      updatedConversionRates: number;
      updatedLeads: number;
      errors: string[];
      duration?: number;
      conversionRateStats?: {
        newInserts: number;
        updated: number;
      };
    }> = [];
    let totalUpdatedConversionRates = 0;
    let totalUpdatedLeads = 0;

    try {
      // Get all client IDs
      const clientIds = await this.leadService.getAllClientIds();
      CronLogger.logComprehensiveUpdateStart(clientIds.length);

      for (const clientId of clientIds) {
        const clientStartTime = Date.now();
        try {
          CronLogger.logClientUpdateStart(clientId);
          
          // Use the comprehensive update method that handles both conversion rates AND lead updates
          const result = await this.leadService.updateConversionRatesAndLeadScoresForClient(clientId);
          
          totalUpdatedConversionRates += result.updatedConversionRates;
          totalUpdatedLeads += result.updatedLeads;
          
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
          
        } catch (error: any) {
          const duration = Date.now() - clientStartTime;
          const errorMsg = CronLogger.logClientUpdateError(clientId, error);
          errors.push(errorMsg);

          // Record failed client result
          clientResults.push({
            clientId,
            success: false,
            updatedConversionRates: 0,
            updatedLeads: 0,
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
        errors: errors.length,
        duration
      });

      return {
        processedClients: clientIds.length,
        totalUpdatedConversionRates,
        totalUpdatedLeads,
        errors
      };
    } catch (error: any) {
      const errorMsg = CronLogger.logComprehensiveUpdateError(error);
      errors.push(errorMsg);
      
      return {
        processedClients: 0,
        totalUpdatedConversionRates: 0,
        totalUpdatedLeads: 0,
        errors
      };
    }
  }

  /**
   * Manual trigger for testing purposes
   */
  public async triggerManualUpdate(): Promise<{
    processedClients: number;
    totalUpdatedConversionRates: number;
    totalUpdatedLeads: number;
    errors: string[];
  }> {
    CronLogger.logManualTrigger();
    await this.runWeeklyUpdate();
    return await this.runComprehensiveWeeklyUpdate();
  }

  /**
   * Check if the cron job is currently running
   */
  public isUpdateRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start a test cron job that runs every minute (for testing)
   * Performs comprehensive updates including conversion rates and lead scores
   */
  public startTestCronJob(): void {
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
  public async getCronJobStats(days: number = 30): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    averageDuration: number;
    lastRun?: Date;
  }> {
    return await MongoCronLogger.getCronJobStats("weeklyLeadProcessor", days);
  }

  /**
   * Get recent cron job logs
   */
  public async getRecentLogs(limit: number = 10): Promise<any[]> {
    return await MongoCronLogger.getRecentLogs("weeklyLeadProcessor", limit);
  }

  /**
   * Cleanup old cron job logs
   */
  public async cleanupOldLogs(keepCount: number = 100): Promise<number> {
    return await MongoCronLogger.cleanupOldLogs("weeklyLeadProcessor", keepCount);
  }
}

// Singleton instance
export default new ConversionRateUpdateService();
