import logger from "./logger.js";

/**
 * Console logging utility for cron job operations
 * This file now only contains console logging utilities
 * MongoDB logging is handled by MongoCronLogger
 */
export class CronLogger {
  /**
   * Log start of weekly update process
   */
  public static logWeeklyUpdateStart(): void {
    logger.info("Starting weekly conversion rate and lead score update process");
  }

  /**
   * Log completion of weekly update process
   */
  public static logWeeklyUpdateCompletion(result: {
    processedClients: number;
    totalUpdatedConversionRates: number;
    totalUpdatedLeads: number;
    errors: string[];
    durationMs: number;
  }): void {
    logger.info("Weekly conversion rate and lead score update completed", {
      processedClients: result.processedClients,
      totalUpdatedConversionRates: result.totalUpdatedConversionRates,
      totalUpdatedLeads: result.totalUpdatedLeads,
      errors: result.errors.length,
      durationMs: result.durationMs
    });
    
    if (result.errors.length > 0) {
      logger.error("Errors occurred during weekly update:", result.errors);
    }
  }

  /**
   * Log start of comprehensive weekly updates for all clients
   */
  public static logComprehensiveUpdateStart(clientCount: number): void {
    logger.info(`Processing comprehensive weekly updates for ${clientCount} clients`);
  }

  /**
   * Log start of client-specific update
   */
  public static logClientUpdateStart(clientId: string): void {
    logger.info(`Processing comprehensive update for client ${clientId}`);
  }

  /**
   * Log completion of client-specific update
   */
  public static logClientUpdateCompletion(clientId: string, result: {
    updatedConversionRates: number;
    updatedLeads: number;
    errors: number;
    duration: number;
  }): void {
    logger.info(`Completed update for client ${clientId}:`, {
      updatedConversionRates: result.updatedConversionRates,
      updatedLeads: result.updatedLeads,
      errors: result.errors,
      duration: result.duration
    });
  }

  /**
   * Log client-specific error
   */
  public static logClientUpdateError(clientId: string, error: any): string {
    const errorMsg = `Error processing comprehensive update for client ${clientId}: ${error.message}`;
    logger.error(errorMsg);
    return errorMsg;
  }

  /**
   * Log fatal error in weekly update
   */
  public static logFatalError(error: any): void {
    logger.error("Fatal error in weekly conversion rate and lead score update:", error);
  }

  /**
   * Log comprehensive update process error
   */
  public static logComprehensiveUpdateError(error: any): string {
    const errorMsg = `Error in comprehensive weekly update process: ${error.message}`;
    logger.error(errorMsg);
    return errorMsg;
  }

  /**
   * Log cron job startup
   */
  public static logCronJobStart(schedule: string): void {
    logger.info(`Starting weekly comprehensive update cron job with schedule: ${schedule}`);
  }

  /**
   * Log cron job startup success
   */
  public static logCronJobStartSuccess(): void {
    logger.info("Weekly comprehensive update cron job started successfully");
  }

  /**
   * Log cron job already running warning
   */
  public static logCronJobAlreadyRunning(): void {
    logger.warn("Weekly comprehensive update is already running, skipping this execution");
  }

  /**
   * Log manual trigger
   */
  public static logManualTrigger(): void {
    logger.info("Manual trigger for comprehensive weekly update");
  }

  /**
   * Log test cron job startup
   */
  public static logTestCronJobStart(): void {
    logger.info("Starting test comprehensive update cron job (runs every minute)");
  }

  /**
   * Log test cron job execution
   */
  public static logTestCronJobExecution(): void {
    logger.info("Test comprehensive update cron job executed");
  }
}

// Default export for convenience
export default CronLogger;