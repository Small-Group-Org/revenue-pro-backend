import logger from "./logger.js";
import executionLogger, { ExecutionLogger, type WeeklyCronExecutionResult } from "./executionLogger.js";

/**
 * Dedicated utility for cron job logging operations
 * Separates logging logic from business logic in cron services
 */
export class CronLogger {
  /**
   * Create execution result object from collected data
   */
  public static createExecutionResult(params: {
    startTime: Date;
    endTime: Date;
    clientIds: string[];
    clientResults: Array<{
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
    }>;
    totalUpdatedConversionRates: number;
    totalUpdatedLeads: number;
    totalCRNewInserts: number;
    totalCRUpdated: number;
    errors: string[];
  }): WeeklyCronExecutionResult {
    const { 
      startTime, 
      endTime, 
      clientIds, 
      clientResults, 
      totalUpdatedConversionRates, 
      totalUpdatedLeads,
      totalCRNewInserts,
      totalCRUpdated,
      errors 
    } = params;

    const executionId = startTime.toISOString().replace(/[:.]/g, '-');
    const duration = endTime.getTime() - startTime.getTime();
    const successfulClients = clientResults.filter(r => r.success).length;
    const failedClients = clientResults.filter(r => !r.success).length;
    const successRate = clientIds.length > 0 ? `${Math.round((successfulClients / clientIds.length) * 100)}%` : '0%';
    
    let status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
    if (failedClients === 0) {
      status = 'SUCCESS';
    } else if (successfulClients > 0) {
      status = 'PARTIAL_SUCCESS';
    } else {
      status = 'FAILED';
    }

    // Calculate CR insights
    const totalCRProcessed = totalCRNewInserts + totalCRUpdated;
    const insertRate = totalCRProcessed > 0 ? `${Math.round((totalCRNewInserts / totalCRProcessed) * 100)}%` : '0%';

    return {
      executionId,
      executionDate: startTime.toISOString().split('T')[0],
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration,
      processedClients: clientIds.length,
      totalUpdatedConversionRates,
      totalUpdatedLeads,
      successfulClients,
      failedClients,
      successRate,
      errors,
      status,
      conversionRateInsights: {
        totalProcessed: totalCRProcessed,
        newInserts: totalCRNewInserts,
        updated: totalCRUpdated,
        insertRate
      },
      clientResults
    };
  }

  /**
   * Log execution result to file and console
   */
  public static async logExecutionResult(executionResult: WeeklyCronExecutionResult): Promise<void> {
    // Log to file
    await executionLogger.logWeeklyCronExecution(executionResult);

    // Print summary to console
    const summary = ExecutionLogger.generateSummary(executionResult);
    console.log(summary);
  }

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

  /**
   * Create client result object for failed client
   */
  public static createFailedClientResult(
    clientId: string, 
    errorMsg: string, 
    duration: number
  ): {
    clientId: string;
    success: boolean;
    updatedConversionRates: number;
    updatedLeads: number;
    errors: string[];
    duration: number;
    conversionRateStats: {
      newInserts: number;
      updated: number;
    };
  } {
    return {
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
    };
  }

  /**
   * Create client result object for successful client
   */
  public static createSuccessfulClientResult(
    clientId: string,
    result: {
      updatedConversionRates: number;
      updatedLeads: number;
      errors: string[];
      conversionRateStats?: {
        newInserts: number;
        updated: number;
      };
    },
    duration: number
  ): {
    clientId: string;
    success: boolean;
    updatedConversionRates: number;
    updatedLeads: number;
    errors: string[];
    duration: number;
    conversionRateStats?: {
      newInserts: number;
      updated: number;
    };
  } {
    return {
      clientId,
      success: result.errors.length === 0,
      updatedConversionRates: result.updatedConversionRates,
      updatedLeads: result.updatedLeads,
      errors: result.errors,
      duration,
      conversionRateStats: result.conversionRateStats
    };
  }

  /**
   * Aggregate CR statistics from client results
   */
  public static aggregateCRStats(clientResults: Array<{
    conversionRateStats?: {
      newInserts: number;
      updated: number;
    };
  }>): {
    totalCRNewInserts: number;
    totalCRUpdated: number;
  } {
    let totalCRNewInserts = 0;
    let totalCRUpdated = 0;

    for (const clientResult of clientResults) {
      if (clientResult.conversionRateStats) {
        totalCRNewInserts += clientResult.conversionRateStats.newInserts;
        totalCRUpdated += clientResult.conversionRateStats.updated;
      }
    }

    return { totalCRNewInserts, totalCRUpdated };
  }
}

// Default export for convenience
export default CronLogger;
