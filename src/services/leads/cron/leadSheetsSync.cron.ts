import cron from 'node-cron';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';
import { MongoCronLogger } from '../../../utils/mongoCronLogger.js';
import leadSheetsSyncService from '../service/leadSheetsSync.service.js';

class LeadSheetsSyncCron {
  private isRunning = false;

  public start(): void {
    const schedule = config.LEAD_SHEETS_SYNC_CRON || '0 4 * * *'; // Default: daily at 4 AM UTC
    cron.schedule(
      schedule,
      async () => {
        if (this.isRunning) {
          logger.warn('[Lead Sheets Sync Cron] Already running; skipping this tick');
          return;
        }
        await this.runOnce();
      },
      { timezone: 'UTC' },
    );

    logger.info(`[Lead Sheets Sync Cron] Scheduled with '${schedule}'`);
  }

  public isRunningCheck(): boolean {
    return this.isRunning;
  }

  public async runOnce(): Promise<void> {
    this.isRunning = true;
    const start = new Date();
    let logId: any = null;

    try {
      logId = await MongoCronLogger.logCronJobStart({
        jobName: 'leadSheetsSync',
        details: { startedAt: start.toISOString() },
        executionId: start.toISOString().replace(/[:.]/g, '-'),
      });

      logger.info('[Lead Sheets Sync Cron] Starting sync');

      await leadSheetsSyncService.syncAllClients();

      await MongoCronLogger.logCronJobSuccess({
        logId,
        details: { completedAt: new Date().toISOString() },
        processedCount: 0, // Count is logged in service
      });

      logger.info('[Lead Sheets Sync Cron] Sync completed successfully');
    } catch (error: any) {
      logger.error('[Lead Sheets Sync Cron] Sync failed', {
        error: error?.message || String(error),
        stack: error?.stack,
      });

      if (logId) {
        await MongoCronLogger.logCronJobFailure({
          logId,
          error: error?.message || String(error),
          details: { stack: error?.stack },
        });
      }
    } finally {
      this.isRunning = false;
    }
  }
}

export default new LeadSheetsSyncCron();

