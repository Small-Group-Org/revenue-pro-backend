import cron from 'node-cron';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';
import { MongoCronLogger } from '../../../utils/mongoCronLogger.js';
import opportunitySyncService from '../service/sync.service.js';
import { ActualService } from '../../actual/service/service.js';
import http from '../../../pkg/http/client.js';
import { DateUtils } from '../../../utils/date.utils.js';

class OpportunitySyncCronService {
  private isRunning = false;

  public start(): void {
    const schedule = config.OPPORTUNITY_SYNC_CRON;
    cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn('Opportunity sync already running; skipping this tick');
        return;
      }
      await this.runOnce();
    }, { timezone: 'UTC' });

    logger.info(`Opportunity sync cron scheduled with '${schedule}'`);
  }

  public isRunningCheck(): boolean {
    return this.isRunning;
  }

  public async runOnce(): Promise<void> {
    const locationId = config.GHL_LOCATION_ID;
    if (!locationId) {
      logger.error('GHL_LOCATION_ID not configured; skipping opportunity sync');
      return;
    }

    if (this.isRunning) {
      logger.warn('Opportunity sync already running; skipping manual trigger');
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

      // NOTE: Original stage aggregation and upsert are temporarily disabled per request.
      //       Keeping code for reference without deletion.
      //
      // // Aggregate in-memory by stage
      // const byStage: Record<string, { pipelineId: string; ticketCount: number; totalAmount: number }> = {};
      // for (const opp of opportunities) {
      //   const stageId = opp.pipelineStageId;
      //   if (!stageId) continue;
      //   if (!byStage[stageId]) {
      //     byStage[stageId] = { pipelineId: opp.pipelineId, ticketCount: 0, totalAmount: 0 };
      //   }
      //   byStage[stageId].ticketCount += 1;
      //   byStage[stageId].totalAmount += Number(opp.monetaryValue || 0);
      // }
      // const formatted = Object.entries(byStage).map(([pipelineStageId, v]) => ({
      //   pipelineId: v.pipelineId,
      //   pipelineStageId,
      //   ticketCount: v.ticketCount,
      //   totalAmount: v.totalAmount,
      //   averageAmount: v.ticketCount ? Math.round((v.totalAmount / v.ticketCount) * 100) / 100 : 0,
      // }));
      //  // Call upsert api
      //  try {
      //   const actualService = new ActualService();
      //   const userId = '68bc48591d96640540bef437';
      //   const startDate = new Date().toISOString().slice(0, 10);
      //   const endDate = startDate;
      //   const stageIndex: Record<string, { ticketCount: number; totalAmount: number }> = {};
      //   for (const s of formatted) {
      //     stageIndex[s.pipelineStageId] = {
      //       ticketCount: Number(s.ticketCount || 0),
      //       totalAmount: Number(s.totalAmount || 0),
      //     };
      //   }
      //   const STAGE_LEADS = '255d36cf-8bef-4b9d-abc9-39044948cfc1';
      //   const STAGES_ESTIMATES_RAN = [
      //     '88626513-fbe6-4af4-a974-10759b5f77f8',
      //     '2e5b1367-ede3-4fe5-806b-9e900f164c6e',
      //     '5f44b126-f4f1-4aed-8348-ebadd5209d0a',
      //   ];
      //   const STAGE_SALES = '2e5b1367-ede3-4fe5-806b-9e900f164c6e';
      //   const leads = stageIndex[STAGE_LEADS]?.ticketCount || 0;
      //   const estimatesRan = STAGES_ESTIMATES_RAN.reduce((sum, id) => sum + (stageIndex[id]?.ticketCount || 0), 0);
      //   const sales = stageIndex[STAGE_SALES]?.ticketCount || 0;
      //   const revenue = stageIndex[STAGE_SALES]?.totalAmount || 0;
      //   await actualService.upsertActualWeekly(
      //     userId,
      //     startDate,
      //     endDate,
      //     {
      //       leads,
      //       estimatesRan,
      //       sales,
      //       revenue,
      //       testingBudgetSpent: 0,
      //       awarenessBrandingBudgetSpent: 0,
      //       leadGenerationBudgetSpent: 0,
      //       estimatesSet: 0,
      //     }
      //   );
      //  } catch (upsertErr: any) {
      //   logger.error('Failed to upsert actuals after opportunity sync', upsertErr);
      //  }

      // New requirement: count specified tags for a specific pipeline and log the counts
      // Only opportunities with 'facebook lead' tag are considered (mandatory requirement)
      const TARGET_PIPELINE_ID = 'FWfjcNV1hNqg3YBfHDHi';
      const TARGET_TAGS = ['facebook lead', 'appt_completed', 'job_won', 'job_lost', "appt_completed_unresponsive", "color_consultation_booked", "appt_booked"];
      const counts: Record<string, number> = Object.fromEntries(TARGET_TAGS.map(t => [t, 0]));

      for (const opp of opportunities) {
        if (!opp?.pipelineId || opp.pipelineId !== TARGET_PIPELINE_ID) continue;

        const collected: string[] = [];
        const contactTags = (opp as any)?.contact?.tags;
        if (Array.isArray(contactTags)) collected.push(...contactTags);
        const relations = (opp as any)?.relations;
        if (Array.isArray(relations)) {
          for (const rel of relations) {
            if (Array.isArray(rel?.tags)) collected.push(...rel.tags);
          }
        }

        if (collected.length === 0) continue;
        const lower = new Set(collected.map((t: string) => String(t).toLowerCase()));
        
        // Mandatory: Only process opportunities with 'facebook lead' tag
        if (!lower.has('facebook lead')) continue;
        
        // Check which target tags are present
        const presentTargetTags = TARGET_TAGS.filter(tag => lower.has(tag));
        
        for (const tag of TARGET_TAGS) {
          // Special case: 'facebook lead' should only be counted if no other TARGET_TAG is present
          if (tag === 'facebook lead') {
            if (presentTargetTags.length === 1 && presentTargetTags[0] === 'facebook lead') {
              counts[tag] += 1;
            }
          } else {
            // For all other tags, count if present
            if (lower.has(tag)) counts[tag] += 1;
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log('[GHL Tag Counts]', {
        pipelineId: TARGET_PIPELINE_ID,
        counts,
      });

      // New: For 'job_won' tagged contacts in target pipeline, fetch contacts and sum custom field values
      const JOB_WON_TAG = 'job_won';
      const CUSTOM_FIELD_ID_TO_SUM = '12W7drbsCQgxp0IFqWu0';
      const jobWonContactIds: string[] = [];

      for (const opp of opportunities) {
        if (!opp?.pipelineId || opp.pipelineId !== TARGET_PIPELINE_ID) continue;
        const collected: string[] = [];
        const contactTags = (opp as any)?.contact?.tags;
        if (Array.isArray(contactTags)) collected.push(...contactTags);
        const relations = (opp as any)?.relations;
        if (Array.isArray(relations)) {
          for (const rel of relations) {
            if (Array.isArray(rel?.tags)) collected.push(...rel.tags);
          }
        }
        const lower = new Set(collected.map((t: string) => String(t).toLowerCase()));
        // Only process opportunities with 'facebook lead' tag (mandatory requirement)
        if (lower.has('facebook lead') && lower.has(JOB_WON_TAG) && opp?.contactId) {
          jobWonContactIds.push(opp.contactId);
        }
      }

      // De-duplicate contact ids
      const uniqueJobWonContactIds = Array.from(new Set(jobWonContactIds));

      let sumCustomField = 0;
      if (uniqueJobWonContactIds.length > 0) {
        const client = new http(config.GHL_BASE_URL, 15000);
        const token = config.GHL_API_TOKEN;
        for (const contactId of uniqueJobWonContactIds) {
          try {
            const resp = await client.get<any>(`/contacts/${encodeURIComponent(contactId)}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Version: '2021-07-28',
              },
            });
            const customFields = resp?.contact?.customFields;
            if (Array.isArray(customFields)) {
              const field = customFields.find((f: any) => f?.id === CUSTOM_FIELD_ID_TO_SUM);
              if (field && field.value !== undefined && field.value !== null && field.value !== '') {
                const val = Number(field.value);
                if (!Number.isNaN(val)) sumCustomField += val;
              }
            }
          } catch (e) {
            logger.warn('Failed to fetch contact for job_won sum', { contactId, error: (e as any)?.message || String(e) });
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log('[GHL job_won custom field sum]', {
        pipelineId: TARGET_PIPELINE_ID,
        contactCount: uniqueJobWonContactIds.length,
        customFieldId: CUSTOM_FIELD_ID_TO_SUM,
        sum: sumCustomField,
      });

      // Calculate derived values for actuals
      // Leads: count unique opportunities that have 'facebook lead' tag (mandatory - only facebook leads are targeted)
      let leadsCount = 0;
      for (const opp of opportunities) {
        if (!opp?.pipelineId || opp.pipelineId !== TARGET_PIPELINE_ID) continue;
        
        const collected: string[] = [];
        const contactTags = (opp as any)?.contact?.tags;
        if (Array.isArray(contactTags)) collected.push(...contactTags);
        const relations = (opp as any)?.relations;
        if (Array.isArray(relations)) {
          for (const rel of relations) {
            if (Array.isArray(rel?.tags)) collected.push(...rel.tags);
          }
        }
        
        if (collected.length === 0) continue;
        const lower = new Set(collected.map((t: string) => String(t).toLowerCase()));
        
        // Count only if 'facebook lead' is present (mandatory requirement)
        if (lower.has('facebook lead')) {
          leadsCount += 1;
        }
      }
      const leads = leadsCount;
      // Estimates Set: count unique opportunities that have BOTH 'facebook lead' (mandatory) AND 'appt_booked'
      let estimatesSetCount = 0;
      for (const opp of opportunities) {
        if (!opp?.pipelineId || opp.pipelineId !== TARGET_PIPELINE_ID) continue;
        
        const collected: string[] = [];
        const contactTags = (opp as any)?.contact?.tags;
        if (Array.isArray(contactTags)) collected.push(...contactTags);
        const relations = (opp as any)?.relations;
        if (Array.isArray(relations)) {
          for (const rel of relations) {
            if (Array.isArray(rel?.tags)) collected.push(...rel.tags);
          }
        }
        
        if (collected.length === 0) continue;
        const lower = new Set(collected.map((t: string) => String(t).toLowerCase()));
        
        // Count if BOTH 'facebook lead' (mandatory) AND 'appt_booked' are present
        if (lower.has('facebook lead') && lower.has('appt_booked')) {
          estimatesSetCount += 1;
        }
      }
      const estimatesSet = estimatesSetCount;
      // Estimates Ran: count unique opportunities that have 'facebook lead' (mandatory) AND ANY of these tags: job_won, job_lost, appt_completed, appt_completed_unresponsive, color_consultation_booked
      const ESTIMATES_RAN_TAGS = ['job_won', 'job_lost', 'appt_completed', 'appt_completed_unresponsive', 'color_consultation_booked'];
      let estimatesRanCount = 0;
      for (const opp of opportunities) {
        if (!opp?.pipelineId || opp.pipelineId !== TARGET_PIPELINE_ID) continue;
        
        const collected: string[] = [];
        const contactTags = (opp as any)?.contact?.tags;
        if (Array.isArray(contactTags)) collected.push(...contactTags);
        const relations = (opp as any)?.relations;
        if (Array.isArray(relations)) {
          for (const rel of relations) {
            if (Array.isArray(rel?.tags)) collected.push(...rel.tags);
          }
        }
        
        if (collected.length === 0) continue;
        const lower = new Set(collected.map((t: string) => String(t).toLowerCase()));
        
        // Count if 'facebook lead' (mandatory) is present AND ANY of the estimates ran tags are present
        if (lower.has('facebook lead')) {
          const hasEstimatesRanTag = ESTIMATES_RAN_TAGS.some(tag => lower.has(tag));
          if (hasEstimatesRanTag) {
            estimatesRanCount += 1;
          }
        }
      }
      const estimatesRan = estimatesRanCount;
      const jobBooked = counts['job_won'] || 0;
      const revenue = sumCustomField;

      // eslint-disable-next-line no-console
      console.log('[GHL Actuals Values]', {
        pipelineId: TARGET_PIPELINE_ID,
        leads,
        estimatesSet,
        estimatesRan, // Count of opportunities with any estimates ran tag
        jobBooked,
        revenue,
      });

      // Call upsert api to store actuals in database
       try {
        const actualService = new ActualService();
        const userId = '68c82dfdac1491efe19d5df0';

        // Calculate the current week's start (Monday) and end (Sunday) dates
        // Use DateUtils.getWeekDetails to ensure consistent week calculation
        const todayStr = new Date().toISOString().slice(0, 10);
        const weekDetails = DateUtils.getWeekDetails(todayStr);
        const startDate = weekDetails.weekStart; // Monday of the current week
        const endDate = weekDetails.weekEnd; // Sunday of the current week

        const savedActual = await actualService.upsertActualWeekly(
          userId,
          startDate,
          endDate,
          {
            leads,
            estimatesRan,
            estimatesSet,
            sales: jobBooked,
            revenue,
            testingBudgetSpent: 0,
            awarenessBrandingBudgetSpent: 0,
            leadGenerationBudgetSpent: 0,
          }
        );

        logger.info('[GHL Actuals Upsert] Success - Data saved to database', {
          pipelineId: TARGET_PIPELINE_ID,
          userId,
          startDate: savedActual.startDate,
          endDate: savedActual.endDate,
          leads: savedActual.leads,
          estimatesSet: savedActual.estimatesSet,
          estimatesRan: savedActual.estimatesRan,
          sales: savedActual.sales,
          revenue: savedActual.revenue,
          documentId: String(savedActual._id),
        });

        // eslint-disable-next-line no-console
        console.log('[GHL Actuals Upsert] Success - Data saved to database', {
          pipelineId: TARGET_PIPELINE_ID,
          userId,
          startDate: savedActual.startDate,
          endDate: savedActual.endDate,
          leads: savedActual.leads,
          estimatesSet: savedActual.estimatesSet,
          estimatesRan: savedActual.estimatesRan,
          sales: savedActual.sales,
          revenue: savedActual.revenue,
          documentId: String(savedActual._id),
          collection: 'weeklyactuals',
        });
       } catch (upsertErr: any) {
        logger.error('[GHL Actuals Upsert] Failed', {
          pipelineId: TARGET_PIPELINE_ID,
          error: upsertErr.message || String(upsertErr),
          stack: upsertErr.stack,
        });

      // eslint-disable-next-line no-console
        console.error('[GHL Actuals Upsert] Failed', {
          pipelineId: TARGET_PIPELINE_ID,
          error: upsertErr.message || String(upsertErr),
          stack: upsertErr.stack,
        });
      }
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


