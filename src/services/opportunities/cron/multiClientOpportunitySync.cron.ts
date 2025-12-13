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

/**
 * Parse date from customfield2 format: "2025-11-25 03:43 PM"
 */
function parseCustomField2Date(dateStr: string): Date | null {
  try {
    // Format: "2025-11-25 03:43 PM"
    const parts = dateStr.trim().split(' ');
    if (parts.length < 3) return null;
    
    const datePart = parts[0]; // "2025-11-25"
    const timePart = parts[1]; // "03:43"
    const amPm = parts[2].toUpperCase(); // "PM"
    
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    
    let hour24 = hours;
    if (amPm === 'PM' && hours !== 12) hour24 = hours + 12;
    if (amPm === 'AM' && hours === 12) hour24 = 0;
    
    return new Date(year, month - 1, day, hour24, minutes, 0, 0);
  } catch (e) {
    return null;
  }
}

/**
 * Check if a date falls within the week range (inclusive)
 */
function isDateInWeekRange(date: Date | null, startDateStr: string, endDateStr: string): boolean {
  if (!date) return false;
  
  const startDate = new Date(startDateStr);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999);
  
  return date >= startDate && date <= endDate;
}

/**
 * Fetch contact and extract the relevant date based on tags
 * Returns the date if found, null otherwise
 */
async function getContactDate(
  contactId: string,
  locationId: string,
  decryptedToken: string,
  tags: Set<string>,
  customFieldId2?: string,
  retry: RetryOptions = { retries: 3, baseDelayMs: 1000 }
): Promise<Date | null> {
  try {
    const clientHttp = new http(config.GHL_BASE_URL, 15000);
    const resp = await withRetry(
      async () => {
        try {
          return await clientHttp.get<any>(`/contacts/${encodeURIComponent(contactId)}`, {
            headers: {
              Authorization: `Bearer ${decryptedToken}`,
              Version: '2021-07-28',
            },
          });
        } catch (error: any) {
          // If we get a 429, throw a specific error that can be handled
          if (error?.message?.includes('429') || error?.code === 429) {
            const rateLimitError: any = new Error('Rate limit exceeded');
            rateLimitError.code = 429;
            throw rateLimitError;
          }
          throw error;
        }
      },
      retry,
    );
    
    const contact = resp?.contact;
    if (!contact) return null;
    
    // Check if has any other TARGET_TAG besides "facebook lead"
    const TARGET_TAGS = [
      'appt_completed',
      'job_won',
      'job_lost',
      'appt_completed_unresponsive',
      'color_consultation_booked',
      'appt_booked',
    ];
    const hasOtherTargetTag = Array.from(tags).some(
      tag => TARGET_TAGS.includes(tag.toLowerCase())
    );
    
    // If has any other TARGET_TAG (not just facebook_lead), check customfield2
    if (hasOtherTargetTag) {
      const customFields = contact?.customFields;
      if (Array.isArray(customFields)) {
        // Try to find by customFieldId2 first, then by name "customfield2"
        let field = customFieldId2 
          ? customFields.find((f: any) => f?.id === customFieldId2 || f?._id === customFieldId2)
          : null;
        
        if (!field) {
          field = customFields.find((f: any) => 
            f?.name?.toLowerCase() === 'customfield2' || 
            f?.fieldName?.toLowerCase() === 'customfield2'
          );
        }
        
        if (field && field.value) {
          const parsedDate = parseCustomField2Date(String(field.value));
          if (parsedDate) {
            return parsedDate;
          }
        }
      }
    }
    
    // If only has "facebook lead" tag (no other TARGET_TAGS), check dateAdded
    if (tags.has('facebook lead') && !hasOtherTargetTag) {
      const dateAdded = contact.dateAdded;
      if (dateAdded) {
        const date = new Date(dateAdded);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    return null;
  } catch (e) {
    logger.warn('Failed to fetch contact for date check', {
      locationId,
      contactId,
      error: (e as any)?.message || String(e),
    });
    return null;
  }
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
        await this.runOnce('cron');
      },
      { timezone: 'UTC' },
    );

    logger.info(`Multi-client opportunity sync cron scheduled with '${schedule}'`);
  }

  public isRunningCheck(): boolean {
    return this.isRunning;
  }

  public async runOnce(type: 'manual' | 'cron'): Promise<void> {
    this.isRunning = true;
    const start = new Date();
    let logId: any = null;

    try {
      // Call dummy endpoint to verify cron is running
      try {
        const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${config.PORT || 3000}`;
        const dummyHttpClient = new http(serverUrl, 5000);
        await dummyHttpClient.get('/api/v1/dummy/multi-opportunity-sync-test');
        logger.info('[MultiClient Opportunity Sync] Dummy endpoint called successfully');
        console.log('[MultiClient Opportunity Sync] Dummy endpoint called successfully - cron is running!');
      } catch (dummyError: any) {
        // Log but don't fail the cron if dummy endpoint call fails
        logger.warn('[MultiClient Opportunity Sync] Failed to call dummy endpoint', {
          error: dummyError?.message || String(dummyError),
        });
        console.warn('[MultiClient Opportunity Sync] Failed to call dummy endpoint:', dummyError?.message || String(dummyError));
      }

      const clients = await ghlClientService.getAllActiveGhlClients();
      if (!clients || clients.length === 0) {
        logger.warn('No active GHL clients found; skipping multi-client sync');
        return;
      }

      logId = await MongoCronLogger.logCronJobStart({
        jobName: 'multiClientOpportunitySync',
        details: { clientCount: clients.length },
        executionId: start.toISOString().replace(/[:.]/g, '-'),
        type,
      });

      // Update status to processing to show progress
      await MongoCronLogger.updateStatusToProcessing(logId);

      // Iterate clients sequentially with spacing to avoid rate-limit bursts
      const perClientDelayMs = 1000; // 1s between clients
      const retry: RetryOptions = { retries: 3, baseDelayMs: 1000 };

      for (const client of clients) {
        const locationId = client.locationId;
        const decryptedToken = ghlClientService.getDecryptedApiToken(client);
        const customFieldId = client.customFieldId;
        const customFieldId2 = client.customFieldId2;
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

        // Process opportunities from all pipelines
        // eslint-disable-next-line no-console
        console.log('[MultiClient GHL] Processing all pipelines:', { locationId, userId });

        // Calculate week dates for filtering
        const todayStr = new Date().toISOString().slice(0, 10);
        const weekDetails = DateUtils.getWeekDetails(todayStr);
        const startDate = weekDetails.weekStart;
        const endDate = weekDetails.weekEnd;

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

        // First pass: collect all opportunities with their tags and contact IDs for date filtering
        interface OpportunityWithTags {
          opp: any;
          tags: Set<string>;
          contactId: string;
        }
        const opportunitiesToProcess: OpportunityWithTags[] = [];
        
        for (const opp of opportunities) {
          if (!opp?.pipelineId || !opp?.contactId) continue;
          
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
          
          // Mandatory check: skip if "facebook lead" tag is not present
          if (!lower.has('facebook lead')) continue;
          
          opportunitiesToProcess.push({
            opp,
            tags: lower,
            contactId: opp.contactId,
          });
        }

        // Fetch contact dates with rate limiting to avoid 429 errors
        const contactDateCache = new Map<string, Date | null>();
        const uniqueContactIds = Array.from(new Set(opportunitiesToProcess.map(o => o.contactId)));
        
        // Fetch contacts sequentially with delays to respect rate limits
        // GHL API typically allows ~100 requests per minute, so we'll be conservative
        const DELAY_BETWEEN_REQUESTS_MS = 100; // 100ms = ~10 requests per second = ~600 per minute (safe)
        
        logger.info('[MultiClient GHL] Fetching contact dates', {
          locationId,
          userId,
          totalContacts: uniqueContactIds.length,
        });
        
        for (let i = 0; i < uniqueContactIds.length; i++) {
          const contactId = uniqueContactIds[i];
          
          // Find tags for this contact (use first opportunity's tags as they should be the same)
          const oppWithTags = opportunitiesToProcess.find(o => o.contactId === contactId);
          if (!oppWithTags) continue;
          
          try {
            const date = await getContactDate(
              contactId,
              locationId,
              decryptedToken,
              oppWithTags.tags,
              customFieldId2,
              retry
            );
            contactDateCache.set(contactId, date);
            
            // Delay between requests to avoid rate limits (except for the last one)
            if (i < uniqueContactIds.length - 1) {
              await delay(DELAY_BETWEEN_REQUESTS_MS);
            }
          } catch (error: any) {
            // If we get a 429 error, wait longer before continuing
            if (error?.message?.includes('429') || error?.code === 429) {
              logger.warn('[MultiClient GHL] Rate limit hit, waiting longer', {
                locationId,
                contactId,
                attempt: i + 1,
                total: uniqueContactIds.length,
              });
              // Wait 5 seconds before retrying
              await delay(5000);
              // Retry this contact
              i--;
              continue;
            }
            // For other errors, log and continue
            logger.warn('[MultiClient GHL] Failed to fetch contact date', {
              locationId,
              contactId,
              error: error?.message || String(error),
            });
          }
          
          // Log progress every 100 contacts
          if ((i + 1) % 100 === 0) {
            logger.info('[MultiClient GHL] Contact date fetch progress', {
              locationId,
              userId,
              processed: i + 1,
              total: uniqueContactIds.length,
              progress: `${Math.round(((i + 1) / uniqueContactIds.length) * 100)}%`,
            });
          }
        }
        
        logger.info('[MultiClient GHL] Finished fetching contact dates', {
          locationId,
          userId,
          totalContacts: uniqueContactIds.length,
          cachedDates: contactDateCache.size,
        });

        // Log opportunities analysis
        let opportunitiesWithPipelineId = opportunities.length;
        let opportunitiesWithTags = opportunitiesToProcess.length;
        const tagDetails: Record<string, { count: number; opportunityIds: string[] }> = {};

        // Second pass: process opportunities using cached dates
        for (const { opp, tags: lower, contactId } of opportunitiesToProcess) {
          // Date filtering: check if date is within week range using cache
          const contactDate = contactDateCache.get(contactId) ?? null;
          
          if (!isDateInWeekRange(contactDate, startDate, endDate)) {
            continue; // Skip this opportunity if date is not in week range
          }
          
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
          opportunitiesWithPipelineId,
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
        for (const { opp, tags: lower, contactId } of opportunitiesToProcess) {
          // Mandatory check: require both "facebook lead" and "job_won" tags
          if (lower.has('facebook lead') && lower.has(JOB_WON_TAG)) {
            // Date filtering: check if date is within week range using cache
            const contactDate = contactDateCache.get(contactId) ?? null;
            
            if (isDateInWeekRange(contactDate, startDate, endDate)) {
              jobWonContactIds.push(contactId);
            }
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
            // small gap between contact fetches (reduced for performance)
            await delay(30);
          }
        }

        // Derived values
        let leadsCount = 0;
        const leadsDetails: { opportunityId: string; tags: string[] }[] = [];
        for (const { opp, tags: lower, contactId } of opportunitiesToProcess) {
          // Count if 'facebook lead' tag is present (already filtered in opportunitiesToProcess)
          // Date filtering: check if date is within week range using cache
          const contactDate = contactDateCache.get(contactId) ?? null;
          
          if (isDateInWeekRange(contactDate, startDate, endDate)) {
            leadsCount += 1;
            leadsDetails.push({ opportunityId: opp.id, tags: Array.from(lower) });
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
        for (const { opp, tags: lower, contactId } of opportunitiesToProcess) {
          // Count if BOTH 'facebook lead' AND 'appt_booked' are present
          if (lower.has('facebook lead') && lower.has('appt_booked')) {
            // Date filtering: check if date is within week range using cache
            const contactDate = contactDateCache.get(contactId) ?? null;
            
            if (isDateInWeekRange(contactDate, startDate, endDate)) {
              estimatesSetCount += 1;
            }
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
        for (const { opp, tags: lower, contactId } of opportunitiesToProcess) {
          // Count if 'facebook lead' tag is present AND ANY of the estimates ran tags are present
          if (lower.has('facebook lead')) {
            const hasEstimatesRanTag = ESTIMATES_RAN_TAGS.some((tag) => lower.has(tag));
            if (hasEstimatesRanTag) {
              // Date filtering: check if date is within week range using cache
              const contactDate = contactDateCache.get(contactId) ?? null;
              
              if (isDateInWeekRange(contactDate, startDate, endDate)) {
                estimatesRanCount += 1;
              }
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

        // Prepare data to upload
        const uploadData = {
          leads,
          estimatesRan,
          estimatesSet,
          sales: jobBooked,
          revenue,
          
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


