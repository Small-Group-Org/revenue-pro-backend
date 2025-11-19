import cron from 'node-cron';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';
import { MongoCronLogger } from '../../../utils/mongoCronLogger.js';
import leadSheetsSyncService from '../service/leadSheetsSync.service.js';

/**
 * Lead Sheets Sync Cron Job
 * 
 * This cron job synchronizes lead statuses from GoHighLevel (GHL) opportunities to the Revenue Pro backend database.
 * 
 * What it does:
 * - Runs on a configurable schedule (default: daily at 4 AM UTC)
 * - Fetches opportunities from GHL API for the configured client
 * - Processes opportunities and determines lead statuses based on tag mappings
 * - Updates existing leads in database (only status and unqualifiedLeadReason)
 * - Prevents concurrent executions
 * - Logs execution to MongoDB for monitoring
 * 
 * Configuration:
 * - LEAD_SHEETS_SYNC_CRON: Cron schedule expression (default: '0 4 * * *')
 * - GHL_LOCATION_ID: GoHighLevel location ID
 * - GHL_API_TOKEN: GoHighLevel API token
 */
class LeadSheetsSyncCron {
  private isRunning = false;

  /**
   * Start the cron scheduler
   */
  public start(): void {
    const schedule = (config as any).LEAD_SHEETS_SYNC_CRON || '0 4 * * *'; // Default: daily at 4 AM UTC
    
    cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn('[Lead Sheets Sync Cron] Already running; skipping this tick');
        return;
      }
      await this.runOnce();
    }, { timezone: 'UTC' });

    logger.info(`[Lead Sheets Sync Cron] Scheduled with '${schedule}'`);
  }

  /**
   * Check if the cron job is currently running
   */
  public isRunningCheck(): boolean {
    return this.isRunning;
  }

  /**
   * Execute a single sync run (useful for manual triggers)
   */
  public async runOnce(): Promise<void> {
    const locationId = config.GHL_LOCATION_ID;
    if (!locationId) {
      logger.error('[Lead Sheets Sync Cron] GHL_LOCATION_ID not configured; skipping lead sheets sync');
      return;
    }

    if (this.isRunning) {
      logger.warn('[Lead Sheets Sync Cron] Already running; skipping manual trigger');
      return;
    }

    this.isRunning = true;
    const start = new Date();
    let logId: any = null;

    try {
      logId = await MongoCronLogger.logCronJobStart({
        jobName: 'leadSheetsSync',
        details: { locationId },
        executionId: start.toISOString().replace(/[:.]/g, '-')
      });

      logger.info('[Lead Sheets Sync Cron] Starting sync job');

      // Use the same client ID as opportunity sync
      const TARGET_PIPELINE_ID = 'FWfjcNV1hNqg3YBfHDHi';
      const userId = '68c82dfdac1491efe19d5df0'; // Same userId as opportunity sync
      const apiToken = config.GHL_API_TOKEN;

      if (!apiToken) {
        throw new Error('GHL_API_TOKEN not configured');
      }

      // Sync for the specific client
      const stats = await leadSheetsSyncService.syncLeadSheetsForClient(
        locationId,
        TARGET_PIPELINE_ID,
        userId,
        apiToken
      );

      await MongoCronLogger.logCronJobSuccess({
        logId,
        details: {
          locationId,
          pipelineId: TARGET_PIPELINE_ID,
          userId,
          processed: stats.processed,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors
        },
        processedCount: stats.processed
      });

      logger.info('[Lead Sheets Sync Cron] Sync job completed successfully', {
        locationId,
        userId,
        stats
      });
    } catch (error: any) {
      logger.error('[Lead Sheets Sync Cron] Sync job failed', error);
      
      if (logId) {
        await MongoCronLogger.logCronJobFailure({
          logId,
          error: error.message || String(error),
          details: { stack: error.stack }
        });
      }
    } finally {
      this.isRunning = false;
    }
  }
}

export default new LeadSheetsSyncCron();

