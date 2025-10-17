import cron from 'node-cron';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';
import { MongoCronLogger } from '../../../utils/mongoCronLogger.js';
import opportunitySyncService from '../service/sync.service.js';
import { ActualService } from '../../actual/service/service.js';

class OpportunitySyncCronService {
  private isRunning = false;

  public start(): void {
    const schedule = config.OPPORTUNITY_SYNC_CRON || '0 3 * * *';
    cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn('Opportunity sync already running; skipping this tick');
        return;
      }
      await this.runOnce();
    }, { timezone: 'UTC' });

    logger.info(`Opportunity sync cron scheduled with '${schedule}'`);
  }

  public async runOnce(): Promise<void> {
    const locationId = config.GHL_LOCATION_ID;
    if (!locationId) {
      logger.error('GHL_LOCATION_ID not configured; skipping opportunity sync');
      return;
    }

    this.isRunning = true;
    const start = new Date();
    let logId: any = null;

    try {
      logId = await MongoCronLogger.logCronJobStart({
        jobName: 'opportunitySync',
        details: { locationId },
        executionId: start.toISOString().replace(/[:.]/g, '-')
      });

      // Fetch opportunities from GHL (do not store in Mongo)
      const ghlResponse = await opportunitySyncService.fetchOpportunities(locationId);
      const opportunities = ghlResponse.opportunities || [];

      await MongoCronLogger.logCronJobSuccess({
        logId,
        details: { fetched: opportunities.length, total: ghlResponse.meta?.total ?? opportunities.length },
        processedCount: opportunities.length,
      });

      logger.info('Opportunity fetch completed', { count: opportunities.length });

      // Aggregate in-memory by stage
      const byStage: Record<string, { pipelineId: string; ticketCount: number; totalAmount: number }> = {};
      for (const opp of opportunities) {
        const stageId = opp.pipelineStageId;
        if (!stageId) continue;
        if (!byStage[stageId]) {
          byStage[stageId] = { pipelineId: opp.pipelineId, ticketCount: 0, totalAmount: 0 };
        }
        byStage[stageId].ticketCount += 1;
        byStage[stageId].totalAmount += Number(opp.monetaryValue || 0);
      }
      const formatted = Object.entries(byStage).map(([pipelineStageId, v]) => ({
        pipelineId: v.pipelineId,
        pipelineStageId,
        ticketCount: v.ticketCount,
        totalAmount: v.totalAmount,
        averageAmount: v.ticketCount ? Math.round((v.totalAmount / v.ticketCount) * 100) / 100 : 0,
      }));
       // Call upsert api
       try {
        const actualService = new ActualService();
        const userId = '68bc48591d96640540bef437';

        // Use ISO date string; service will compute week in its helper
        const startDate = new Date().toISOString().slice(0, 10);
        const endDate = startDate;

        // Build index by stage id for quick lookup (from formatted)
        const stageIndex: Record<string, { ticketCount: number; totalAmount: number }> = {};
        for (const s of formatted) {
          stageIndex[s.pipelineStageId] = {
            ticketCount: Number(s.ticketCount || 0),
            totalAmount: Number(s.totalAmount || 0),
          };
        }

        // Mappings per requirements
        const STAGE_LEADS = '255d36cf-8bef-4b9d-abc9-39044948cfc1';
        const STAGES_ESTIMATES_RAN = [
          '88626513-fbe6-4af4-a974-10759b5f77f8',
          '2e5b1367-ede3-4fe5-806b-9e900f164c6e',
          '5f44b126-f4f1-4aed-8348-ebadd5209d0a',
        ];
        const STAGE_SALES = '2e5b1367-ede3-4fe5-806b-9e900f164c6e';

        const leads = stageIndex[STAGE_LEADS]?.ticketCount || 0;
        const estimatesRan = STAGES_ESTIMATES_RAN.reduce((sum, id) => sum + (stageIndex[id]?.ticketCount || 0), 0);
        const sales = stageIndex[STAGE_SALES]?.ticketCount || 0;
        const revenue = stageIndex[STAGE_SALES]?.totalAmount || 0;

        await actualService.upsertActualWeekly(
          userId,
          startDate,
          endDate,
          {
            leads,
            estimatesRan,
            sales,
            revenue,
            testingBudgetSpent: 0,
            awarenessBrandingBudgetSpent: 0,
            leadGenerationBudgetSpent: 0,
            estimatesSet: 0,
          }
        );
       } catch (upsertErr: any) {
        logger.error('Failed to upsert actuals after opportunity sync', upsertErr);
       }

      // Console log the final aggregated result
      // Keeping it concise but informative
      // eslint-disable-next-line no-console
      // console.log('[OpportunitySync Aggregation]', {
      //   count: formatted.length,
      //   stages: formatted
      // });
    } catch (error: any) {
      logger.error('Opportunity sync failed', error);
      if (logId) {
        await MongoCronLogger.logCronJobFailure({
          logId,
          error: error.message || String(error),
          details: { stack: error.stack },
        });
      }
    } finally {
      this.isRunning = false;
    }
  }
}

export default new OpportunitySyncCronService();


