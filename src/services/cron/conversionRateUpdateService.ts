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
   */
  public startWeeklyCronJob(): void {
    // Cron schedule: "0 2 * * 0" = Every Sunday at 2:00 AM
    // For testing, you can use "*/5 * * * *" to run every 5 minutes
    const schedule = "0 2 * * 0";
    
    logger.info(`Starting weekly conversion rate update cron job with schedule: ${schedule}`);
    
    cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn("Weekly conversion rate update is already running, skipping this execution");
        return;
      }
      
      await this.runWeeklyUpdate();
    }, {
      timezone: "UTC" // Adjust timezone as needed
    });

    logger.info("Weekly conversion rate update cron job started successfully");
  }

  /**
   * Run the weekly conversion rate update process
   */
  public async runWeeklyUpdate(): Promise<void> {
    this.isRunning = true;
    const startTime = new Date();
    
    logger.info("Starting weekly conversion rate update process");
    
    try {
      const result = await this.leadService.processWeeklyConversionRateUpdates();
      
      const duration = Date.now() - startTime.getTime();
      
      logger.info("Weekly conversion rate update completed", {
        processedClients: result.processedClients,
        totalUpdatedRates: result.totalUpdatedRates,
        errors: result.errors.length,
        durationMs: duration
      });
      
      if (result.errors.length > 0) {
        logger.error("Errors occurred during weekly conversion rate update:", result.errors);
      }
      
    } catch (error: any) {
      logger.error("Fatal error in weekly conversion rate update:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for testing purposes
   */
  public async triggerManualUpdate(): Promise<{
    processedClients: number;
    totalUpdatedRates: number;
    errors: string[];
  }> {
    logger.info("Manual trigger for weekly conversion rate update");
    await this.runWeeklyUpdate();
    return await this.leadService.processWeeklyConversionRateUpdates();
  }

  /**
   * Check if the cron job is currently running
   */
  public isUpdateRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start a test cron job that runs every minute (for testing)
   */
  public startTestCronJob(): void {
    logger.info("Starting test cron job (runs every minute)");
    
    cron.schedule("*/1 * * * *", async () => {
      logger.info("Test cron job executed");
      if (!this.isRunning) {
        await this.runWeeklyUpdate();
      }
    });
  }
}

// Singleton instance
export default new ConversionRateUpdateService();
