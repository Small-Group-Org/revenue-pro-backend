import cron from "node-cron";
import { LeadService } from "../leads/service/service.js";
import logger from "../../utils/logger.js";

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
    
    logger.info(`Starting weekly comprehensive update cron job with schedule: ${schedule}`);
    
    cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn("Weekly comprehensive update is already running, skipping this execution");
        return;
      }
      
      await this.runWeeklyUpdate();
    }, {
      timezone: "UTC" // Adjust timezone as needed
    });

    logger.info("Weekly comprehensive update cron job started successfully");
  }

  /**
   * Run the weekly conversion rate and lead score update process
   */
  public async runWeeklyUpdate(): Promise<void> {
    this.isRunning = true;
    const startTime = new Date();
    
    logger.info("Starting weekly conversion rate and lead score update process");
    
    try {
      const result = await this.runComprehensiveWeeklyUpdate();
      
      const duration = Date.now() - startTime.getTime();
      
      logger.info("Weekly conversion rate and lead score update completed", {
        processedClients: result.processedClients,
        totalUpdatedConversionRates: result.totalUpdatedConversionRates,
        totalUpdatedLeads: result.totalUpdatedLeads,
        errors: result.errors.length,
        durationMs: duration
      });
      
      if (result.errors.length > 0) {
        logger.error("Errors occurred during weekly update:", result.errors);
      }
      
    } catch (error: any) {
      logger.error("Fatal error in weekly conversion rate and lead score update:", error);
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
    const errors: string[] = [];
    let totalUpdatedConversionRates = 0;
    let totalUpdatedLeads = 0;

    try {
      // Get all client IDs
      const clientIds = await this.leadService.getAllClientIds();
      logger.info(`Processing comprehensive weekly updates for ${clientIds.length} clients`);

      for (const clientId of clientIds) {
        try {
          logger.info(`Processing comprehensive update for client ${clientId}`);
          
          // Use the comprehensive update method that handles both conversion rates AND lead updates
          const result = await this.leadService.updateConversionRatesAndLeadScoresForClient(clientId);
          
          totalUpdatedConversionRates += result.updatedConversionRates;
          totalUpdatedLeads += result.updatedLeads;
          
          if (result.errors.length > 0) {
            errors.push(...result.errors);
          }
          
          logger.info(`Completed update for client ${clientId}:`, {
            updatedConversionRates: result.updatedConversionRates,
            updatedLeads: result.updatedLeads,
            errors: result.errors.length
          });
          
        } catch (error: any) {
          const errorMsg = `Error processing comprehensive update for client ${clientId}: ${error.message}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return {
        processedClients: clientIds.length,
        totalUpdatedConversionRates,
        totalUpdatedLeads,
        errors
      };
    } catch (error: any) {
      const errorMsg = `Error in comprehensive weekly update process: ${error.message}`;
      logger.error(errorMsg);
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
    logger.info("Manual trigger for comprehensive weekly update");
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
    logger.info("Starting test comprehensive update cron job (runs every minute)");
    
    cron.schedule("*/1 * * * *", async () => {
      logger.info("Test comprehensive update cron job executed");
      if (!this.isRunning) {
        await this.runWeeklyUpdate();
      }
    });
  }
}

// Singleton instance
export default new ConversionRateUpdateService();
