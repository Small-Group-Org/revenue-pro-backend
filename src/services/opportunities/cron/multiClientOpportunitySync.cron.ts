import cron from 'node-cron';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';
import { MongoCronLogger } from '../../../utils/mongoCronLogger.js';
import opportunitySyncService from '../service/sync.service.js';
import { ActualService } from '../../actual/service/service.js';
import http from '../../../pkg/http/client.js';
import { DateUtils } from '../../../utils/date.utils.js';
import ghlClientService from '../../ghlClient/service/service.js';

type RetryOptions = {
  retries: number;
  baseDelayMs: number;
};

async function withRetry<T>(fn: () => Promise<T>, { retries, baseDelayMs }: RetryOptions): Promise<T> {
  let attempt = 0;
  // exponential backoff with jitter
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries) throw err;
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * (backoff / 2));
      const sleep = backoff + jitter;
      await new Promise((r) => setTimeout(r, sleep));
    }
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MultiClientOpportunitySyncCron {
  private isRunning = false;

  public start(): void {
    const schedule = config.OPPORTUNITY_SYNC_CRON;
    cron.schedule(
      schedule,
      async () => {
        if (this.isRunning) {
          logger.warn('Multi-client opportunity sync already running; skipping this tick');
          return;
        }
        await this.runOnce();
      },
      { timezone: 'UTC' },
    );

    logger.info(`Multi-client opportunity sync cron scheduled with '${schedule}'`);
  }

  public isRunningCheck(): boolean {
    return this.isRunning;
  }

  public async runOnce(): Promise<void> {
    this.isRunning = true;
    const start = new Date();
    let logId: any = null;

    try {
      const clients = await ghlClientService.getAllActiveGhlClients();
      if (!clients || clients.length === 0) {
        logger.warn('No active GHL clients found; skipping multi-client sync');
        return;
      }

      logId = await MongoCronLogger.logCronJobStart({
        jobName: 'multiClientOpportunitySync',
        details: { clientCount: clients.length },
        executionId: start.toISOString().replace(/[:.]/g, '-'),
      });

      // Iterate clients sequentially with spacing to avoid rate-limit bursts
      const perClientDelayMs = 1000; // 1s between clients
      const retry: RetryOptions = { retries: 3, baseDelayMs: 1000 };

      for (const client of clients) {
        const locationId = client.locationId;
        const decryptedToken = ghlClientService.getDecryptedApiToken(client);
        const customFieldId = client.customFieldId;
        const userId = client.revenueProClientId;

        if (!locationId || !decryptedToken || !userId) {
          logger.warn('Skipping client due to missing required fields', {
            id: client._id?.toString?.(),
            locationId,
            hasToken: Boolean(decryptedToken),
            hasUserId: Boolean(userId),
          });
          continue;
        }

        // Fetch opportunities with retry using client token
        let ghlResponse;
        let opportunities: any[] = [];
        try {
          ghlResponse = await withRetry(
            () => opportunitySyncService.fetchOpportunities(locationId, decryptedToken),
            retry,
          );
          opportunities = ghlResponse.opportunities || [];
          
          const opportunitiesLog = {
            locationId,
            userId,
            totalOpportunities: opportunities.length,
            totalFromMeta: ghlResponse.meta?.total || 0,
          };
          logger.info('[MultiClient GHL] Opportunities fetched', opportunitiesLog);
          // eslint-disable-next-line no-console
          console.log('[MultiClient GHL] Opportunities fetched:', JSON.stringify(opportunitiesLog, null, 2));
        } catch (fetchError: any) {
          logger.error('[MultiClient GHL] Failed to fetch opportunities', {
            locationId,
            userId,
            error: fetchError?.message || String(fetchError),
            errorCode: fetchError?.code,
          });
          // Continue to next client if fetch fails
          await delay(perClientDelayMs);
          continue;
        }

        // Get pipeline ID from client configuration (each client has their own pipeline ID)
        const TARGET_PIPELINE_ID = client.pipelineId;
        if (!TARGET_PIPELINE_ID) {
          logger.warn('Skipping client due to missing pipeline ID', {
            locationId,
            userId,
          });
          // eslint-disable-next-line no-console
          console.log('[MultiClient GHL] Skipping client - missing pipeline ID:', { locationId, userId });
          await delay(perClientDelayMs);
          continue;
        }

        // eslint-disable-next-line no-console
        console.log('[MultiClient GHL] Using pipeline ID:', { locationId, userId, pipelineId: TARGET_PIPELINE_ID });

        // Count target tags and sum revenue from custom field for job_won contacts
        const TARGET_TAGS = [
          'facebook lead',
          'appt_completed',
          'job_won',
          'job_lost',
          'appt_completed_unresponsive',
          'color_consultation_booked',
          'appt_booked',
        ];
        const counts: Record<string, number> = Object.fromEntries(TARGET_TAGS.map((t) => [t, 0]));

        // Log opportunities analysis
        let opportunitiesInTargetPipeline = 0;
        let opportunitiesWithTags = 0;
        const tagDetails: Record<string, { count: number; opportunityIds: string[] }> = {};

        for (const opp of opportunities) {
          if (!opp?.pipelineId || opp.pipelineId !== TARGET_PIPELINE_ID) continue;
          opportunitiesInTargetPipeline++;

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
          opportunitiesWithTags++;

          const lower = new Set(collected.map((t: string) => String(t).toLowerCase()));
          
          // Mandatory check: skip if "facebook lead" tag is not present
          if (!lower.has('facebook lead')) continue;
          
          const presentTargetTags = TARGET_TAGS.filter((tag) => lower.has(tag) && tag !== 'facebook lead');
          
          // Log tag details for debugging
          for (const tag of TARGET_TAGS) {
            if (!tagDetails[tag]) {
              tagDetails[tag] = { count: 0, opportunityIds: [] };
            }
            
            if (tag === 'facebook lead') {
              if (presentTargetTags.length === 0) {
                counts[tag] += 1;
                tagDetails[tag].count += 1;
                tagDetails[tag].opportunityIds.push(opp.id);
              }
            } else {
              if (lower.has(tag)) {
                counts[tag] += 1;
                tagDetails[tag].count += 1;
                tagDetails[tag].opportunityIds.push(opp.id);
              }
            }
          }
        }

        const tagAnalysisLog = {
          locationId,
          userId,
          totalOpportunities: opportunities.length,
          opportunitiesInTargetPipeline,
          opportunitiesWithTags,
          tagCounts: counts,
          tagDetails: Object.fromEntries(
            Object.entries(tagDetails).map(([tag, data]) => [
              tag,
              { count: data.count, sampleIds: data.opportunityIds.slice(0, 5) },
            ])
          ),
        };
        logger.info('[MultiClient GHL] Tag analysis', tagAnalysisLog);
        // eslint-disable-next-line no-console
        console.log('[MultiClient GHL] Tag analysis:', JSON.stringify(tagAnalysisLog, null, 2));

        // Sum revenue custom field on job_won contacts
        const JOB_WON_TAG = 'job_won';
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
          // Mandatory check: require both "facebook lead" and "job_won" tags
          if (lower.has('facebook lead') && lower.has(JOB_WON_TAG) && opp?.contactId) {
            jobWonContactIds.push(opp.contactId);
          }
        }
        const uniqueJobWonContactIds = Array.from(new Set(jobWonContactIds));

        let sumCustomField = 0;
        if (uniqueJobWonContactIds.length > 0 && customFieldId) {
          const clientHttp = new http(config.GHL_BASE_URL, 15000);
          for (const contactId of uniqueJobWonContactIds) {
            try {
              const resp = await withRetry(
                () =>
                  clientHttp.get<any>(`/contacts/${encodeURIComponent(contactId)}`, {
                    headers: {
                      Authorization: `Bearer ${decryptedToken}`,
                      Version: '2021-07-28',
                    },
                  }),
                retry,
              );
              const customFields = resp?.contact?.customFields;
              if (Array.isArray(customFields)) {
                const field = customFields.find((f: any) => f?.id === customFieldId);
                if (field && field.value !== undefined && field.value !== null && field.value !== '') {
                  const val = Number(field.value);
                  if (!Number.isNaN(val)) sumCustomField += val;
                }
              }
            } catch (e) {
              logger.warn('Failed to fetch contact for job_won sum', {
                locationId,
                contactId,
                error: (e as any)?.message || String(e),
              });
            }
            // small gap between contact fetches
            await delay(150);
          }
        }

        // Derived values
        let leadsCount = 0;
        const leadsDetails: { opportunityId: string; tags: string[] }[] = [];
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
          // Count if 'facebook lead' tag is present
          if (lower.has('facebook lead')) {
            leadsCount += 1;
            leadsDetails.push({ opportunityId: opp.id, tags: collected });
          }
        }
        const leads = leadsCount;

        const leadsLog = {
          locationId,
          userId,
          leadsCount,
          leadsDetails: leadsDetails.slice(0, 5), // Sample first 5
        };
        logger.info('[MultiClient GHL] Leads calculation', leadsLog);
        // eslint-disable-next-line no-console
        console.log('[MultiClient GHL] Leads calculation:', JSON.stringify(leadsLog, null, 2));

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
          // Count if BOTH 'facebook lead' AND 'appt_booked' are present
          if (lower.has('facebook lead') && lower.has('appt_booked')) {
            estimatesSetCount += 1;
          }
        }
        const estimatesSet = estimatesSetCount;

        const ESTIMATES_RAN_TAGS = [
          'job_won',
          'job_lost',
          'appt_completed',
          'appt_completed_unresponsive',
          'color_consultation_booked',
        ];
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
          // Count if 'facebook lead' tag is present AND ANY of the estimates ran tags are present
          if (lower.has('facebook lead')) {
            const hasEstimatesRanTag = ESTIMATES_RAN_TAGS.some((tag) => lower.has(tag));
            if (hasEstimatesRanTag) {
              estimatesRanCount += 1;
            }
          }
        }
        const estimatesRan = estimatesRanCount;
        const jobBooked = counts['job_won'] || 0;
        const revenue = sumCustomField;

        // Log final calculated values
        const finalValuesLog = {
          locationId,
          userId,
          leads,
          estimatesSet,
          estimatesRan,
          sales: jobBooked,
          revenue,
          jobWonContactIdsCount: uniqueJobWonContactIds.length,
          customFieldId,
          hasCustomFieldId: !!customFieldId,
        };
        logger.info('[MultiClient GHL] Final calculated values', finalValuesLog);
        // eslint-disable-next-line no-console
        console.log('[MultiClient GHL] Final calculated values:', JSON.stringify(finalValuesLog, null, 2));

        const actualService = new ActualService();
        const todayStr = new Date().toISOString().slice(0, 10);
        const weekDetails = DateUtils.getWeekDetails(todayStr);
        const startDate = weekDetails.weekStart;
        const endDate = weekDetails.weekEnd;

        // Prepare data to upload
        const uploadData = {
          leads,
          estimatesRan,
          estimatesSet,
          sales: jobBooked,
          revenue,
          testingBudgetSpent: 0,
          awarenessBrandingBudgetSpent: 0,
          leadGenerationBudgetSpent: 0,
        };

        // Log what data is being uploaded to Revenue Pro API
        const logMessage = {
          userId,
          locationId,
          startDate,
          endDate,
          uploadData: {
            leads: uploadData.leads,
            estimatesRan: uploadData.estimatesRan,
            estimatesSet: uploadData.estimatesSet,
            sales: uploadData.sales,
            revenue: uploadData.revenue,
            testingBudgetSpent: uploadData.testingBudgetSpent,
            awarenessBrandingBudgetSpent: uploadData.awarenessBrandingBudgetSpent,
            leadGenerationBudgetSpent: uploadData.leadGenerationBudgetSpent,
          },
          weekDetails: {
            weekStart: weekDetails.weekStart,
            weekEnd: weekDetails.weekEnd,
            year: weekDetails.year,
            weekNumber: weekDetails.weekNumber,
          },
        };

        logger.info('[MultiClient GHL Actuals] Uploading data to Revenue Pro API', logMessage);
        // eslint-disable-next-line no-console
        console.log('[MultiClient GHL Actuals] Uploading data to Revenue Pro API:', JSON.stringify(logMessage, null, 2));

        let savedActual;
        try {
          savedActual = await withRetry(
            () => actualService.upsertActualWeekly(userId, startDate, endDate, uploadData),
            retry,
          );

          // Log the API response
          const savedActualObj = savedActual.toObject ? savedActual.toObject() : savedActual;
          const apiResponse = {
            success: true,
            documentId: String(savedActual._id),
            userId: savedActual.userId,
            startDate: savedActual.startDate,
            endDate: savedActual.endDate,
            leads: savedActual.leads,
            estimatesRan: savedActual.estimatesRan,
            estimatesSet: savedActual.estimatesSet,
            sales: savedActual.sales,
            revenue: savedActual.revenue,
            testingBudgetSpent: savedActual.testingBudgetSpent,
            awarenessBrandingBudgetSpent: savedActual.awarenessBrandingBudgetSpent,
            leadGenerationBudgetSpent: savedActual.leadGenerationBudgetSpent,
            createdAt: (savedActualObj as any).createdAt || (savedActualObj as any).created_at,
            updatedAt: (savedActualObj as any).updatedAt || (savedActualObj as any).updated_at,
          };

          logger.info('[MultiClient GHL Actuals] API Response received', apiResponse);
          // eslint-disable-next-line no-console
          console.log('[MultiClient GHL Actuals] API Response received:', JSON.stringify(apiResponse, null, 2));
        } catch (apiError: any) {
          // Log API error
          const errorResponse = {
            success: false,
            error: apiError?.message || String(apiError),
            errorCode: apiError?.code,
            userId,
            locationId,
            startDate,
            endDate,
            uploadData,
          };

          logger.error('[MultiClient GHL Actuals] API call failed', errorResponse);
          throw apiError;
        }

        logger.info('[MultiClient GHL Actuals Upsert] Success', {
          userId,
          locationId,
          startDate: savedActual.startDate,
          endDate: savedActual.endDate,
          leads: savedActual.leads,
          estimatesSet: savedActual.estimatesSet,
          estimatesRan: savedActual.estimatesRan,
          sales: savedActual.sales,
          revenue: savedActual.revenue,
          documentId: String(savedActual._id),
        });

        // space between clients to reduce burst load
        await delay(perClientDelayMs);
      }

      await MongoCronLogger.logCronJobSuccess({
        logId,
        details: { processedClients: true },
        processedCount: clients.length,
      });
    } catch (error: any) {
      logger.error('Multi-client opportunity sync failed', error);
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

export default new MultiClientOpportunitySyncCron();


