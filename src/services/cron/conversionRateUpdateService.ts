import cron from "node-cron";
import { LeadService } from "../leads/service/service.js";
import logger from "../../utils/logger.js";
import CronLogger from "../../utils/cronLogger.js";

export class ConversionRateUpdateService {
  private leadService: LeadService;
  private isRunning: boolean = false;

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
    
    CronLogger.logWeeklyUpdateStart();
    
    try {
      const result = await this.runComprehensiveWeeklyUpdate();
      
      const duration = Date.now() - startTime.getTime();
      
      CronLogger.logWeeklyUpdateCompletion({
        processedClients: result.processedClients,
        totalUpdatedConversionRates: result.totalUpdatedConversionRates,
        totalUpdatedLeads: result.totalUpdatedLeads,
        errors: result.errors,
        durationMs: duration
      });
      
    } catch (error: any) {
      CronLogger.logFatalError(error);
    } finally {
      this.isRunning = false;
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
          clientResults.push(CronLogger.createSuccessfulClientResult(clientId, result, duration));
          
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
          clientResults.push(CronLogger.createFailedClientResult(clientId, errorMsg, duration));
        }
      }

      // Calculate summary metrics and log execution result
      const endTime = new Date();
      
      // Aggregate CR statistics from client results
      const { totalCRNewInserts, totalCRUpdated } = CronLogger.aggregateCRStats(clientResults);

      // Create execution result
      const executionResult = CronLogger.createExecutionResult({
        startTime,
        endTime,
        clientIds,
        clientResults,
        totalUpdatedConversionRates,
        totalUpdatedLeads,
        totalCRNewInserts,
        totalCRUpdated,
        errors
      });

      // Log execution result to file and console
      await CronLogger.logExecutionResult(executionResult);

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
}

// Singleton instance
export default new ConversionRateUpdateService();
