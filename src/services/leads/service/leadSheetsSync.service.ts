import http from '../../../pkg/http/client.js';
import { config } from '../../../config.js';
import logger from '../../../utils/logger.js';
import { leadRepository } from '../repository/LeadRepository.js';
import { LeadService } from './LeadService.js';
import { ILead, LeadStatus } from '../domain/leads.domain.js';

// Tag categories as defined in documentation
const NEW_LEAD_TAGS = ['new_lead', 'facebook lead'];
const IN_PROGRESS_TAGS = [
  'day1am', 'day1pm', 'day2am', 'day2pm', 'day3am', 'day3pm',
  'day4am', 'day4pm', 'day5am', 'day5pm', 'day6am', 'day6pm',
  'day7am', 'day7pm', 'day8am', 'day8pm', 'day9am', 'day9pm',
  'day10am', 'day10pm', 'day11am', 'day11pm', 'day12am', 'day12pm',
  'day13am', 'day13pm', 'day14am', 'day14pm'
];
const ESTIMATE_SET_TAGS = ['appt_completed', 'appt_cancelled', 'job_won', 'job_lost', 'appt_booked'];
const UNQUALIFIED_TAGS = [
  'dq - bad phone number',
  'dq - job too small',
  'dq - looking for job',
  'dq - no longer interested',
  'dq - out of area',
  'dq - said didn\'t fill out a form',
  'dq - service not offered',
  'dq - services we dont offer'
];

const ALL_ALLOWED_TAGS = [
  ...NEW_LEAD_TAGS,
  ...IN_PROGRESS_TAGS,
  ...ESTIMATE_SET_TAGS,
  ...UNQUALIFIED_TAGS
];

interface GhlOpportunity {
  id: string;
  contactId?: string;
  contact?: {
    email?: string;
    name?: string;
    tags?: string[];
  };
  relations?: Array<{
    tags?: string[];
  }>;
  pipelineId?: string;
}

interface GhlResponse {
  opportunities: GhlOpportunity[];
  meta: {
    total: number;
    nextPageUrl?: string | null;
  };
}

interface SyncStats {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface StatusDeterminationResult {
  status: LeadStatus;
  unqualifiedReason?: string;
}

/**
 * Lead Sheets Sync Service
 * 
 * This service synchronizes lead statuses from GoHighLevel (GHL) opportunities to the Revenue Pro backend database.
 * 
 * What it does:
 * 1. Fetches opportunities from GHL API for configured clients
 * 2. Extracts tags from opportunities (contact tags + relation tags)
 * 3. Determines lead status based on tag priority:
 *    - Mandatory: Must have "facebook lead" tag (skips if missing)
 *    - Priority 1: Any DQ tag → unqualified
 *    - Priority 2: Any estimate tag → estimate_set
 *    - Priority 3: Any day tag → in_progress
 *    - Default: Only has "facebook lead" or "new_lead" → new
 * 4. Updates existing leads in database (only status and unqualifiedLeadReason)
 * 5. Skips leads that:
 *    - Don't have email
 *    - Don't have "facebook lead" tag (mandatory)
 *    - Don't exist in database
 *    - Missing required fields (service, zip)
 */
export class LeadSheetsSyncService {
  private client: http;
  private leadService: LeadService;

  constructor() {
    this.client = new http(config.GHL_BASE_URL, 15000);
    this.leadService = new LeadService();
  }

  /**
   * Determine lead status from tags based on priority
   * Only considers allowed tags - unknown tags are ignored
   */
  private determineStatusFromTags(tags: string[]): StatusDeterminationResult | null {
    // Convert all tags to lowercase for comparison
    const lowerTags = tags.map(t => String(t).toLowerCase());
    
    // Filter to only allowed tags (ignore unknown tags)
    const allowedTags = lowerTags.filter(tag => 
      ALL_ALLOWED_TAGS.some(allowed => allowed.toLowerCase() === tag)
    );
    const tagSet = new Set(allowedTags);

    // Mandatory check: Must have "facebook lead" tag
    if (!tagSet.has('facebook lead')) {
      return null; // Skip this lead
    }

    // Priority-based status determination (only using allowed tags)
    // Priority 1: Unqualified tags (highest priority)
    const unqualifiedTag = UNQUALIFIED_TAGS.find(tag => tagSet.has(tag.toLowerCase()));
    if (unqualifiedTag) {
      return {
        status: 'unqualified',
        unqualifiedReason: unqualifiedTag
      };
    }

    // Priority 2: Estimate set tags
    const estimateSetTag = ESTIMATE_SET_TAGS.find(tag => tagSet.has(tag.toLowerCase()));
    if (estimateSetTag) {
      return {
        status: 'estimate_set'
      };
    }

    // Priority 3: In progress tags
    const inProgressTag = IN_PROGRESS_TAGS.find(tag => tagSet.has(tag.toLowerCase()));
    if (inProgressTag) {
      return {
        status: 'in_progress'
      };
    }

    // Default: Only has "facebook lead" tag (unknown tags are ignored)
    return {
      status: 'new'
    };
  }

  /**
   * Collect all tags from an opportunity (contact tags + relation tags)
   */
  private collectTags(opportunity: GhlOpportunity): string[] {
    const tags: string[] = [];
    
    // Collect contact tags
    if (Array.isArray(opportunity.contact?.tags)) {
      tags.push(...opportunity.contact.tags);
    }

    // Collect relation tags
    if (Array.isArray(opportunity.relations)) {
      for (const rel of opportunity.relations) {
        if (Array.isArray(rel.tags)) {
          tags.push(...rel.tags);
        }
      }
    }

    return tags;
  }

  /**
   * Fetch opportunities from GHL API with pagination
   */
  private async fetchOpportunities(
    locationId: string,
    pipelineId: string,
    apiToken: string
  ): Promise<GhlOpportunity[]> {
    const allOpportunities: GhlOpportunity[] = [];
    let url: string | null = `/opportunities/search?location_id=${encodeURIComponent(locationId)}`;

    while (url) {
      try {
        const response = await this.client.get<GhlResponse>(url, {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Version: '2021-07-28',
          },
        }) as GhlResponse;

        if (response?.opportunities?.length) {
          // Filter by pipeline ID if provided
          const filtered: GhlOpportunity[] = pipelineId
            ? response.opportunities.filter((opp: GhlOpportunity) => opp.pipelineId === pipelineId)
            : response.opportunities;
          
          allOpportunities.push(...filtered);
        }

        url = response?.meta?.nextPageUrl || null;
      } catch (error: any) {
        logger.error('[Lead Sheets Sync] Failed to fetch opportunities page', {
          url,
          error: error.message || String(error)
        });
        throw error;
      }
    }

    return allOpportunities;
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * (baseDelay / 2);
          await new Promise(resolve => setTimeout(resolve, delay));
          logger.warn(`[Lead Sheets Sync] Retry attempt ${attempt}/${maxRetries}`, {
            error: error.message || String(error)
          });
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Sync leads for a single GHL client
   */
  public async syncLeadSheetsForClient(
    locationId: string,
    pipelineId: string,
    revenueProClientId: string,
    apiToken: string
  ): Promise<SyncStats> {
    const stats: SyncStats = {
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };

    try {
      logger.info('[Lead Sheets Sync] Starting sync for client', {
        locationId,
        pipelineId,
        revenueProClientId
      });

      // Fetch opportunities from GHL
      const opportunities = await this.retryWithBackoff(() =>
        this.fetchOpportunities(locationId, pipelineId, apiToken)
      );

      logger.info('[Lead Sheets Sync] Fetched opportunities', {
        locationId,
        count: opportunities.length
      });

      // Process each opportunity
      for (const opp of opportunities) {
        try {
          stats.processed++;

          // Extract email from contact
          const email = opp.contact?.email?.trim();
          if (!email) {
            stats.skipped++;
            continue;
          }

          // Collect tags
          const tags = this.collectTags(opp);
          
          // Determine status from tags
          const statusResult = this.determineStatusFromTags(tags);
          
          // Skip if no status determined (missing mandatory tag)
          if (!statusResult) {
            stats.skipped++;
            continue;
          }

          // Find lead in database by email and clientId
          const existingLeads = await leadRepository.findLeads({
            email,
            clientId: revenueProClientId
          });

          if (!existingLeads || existingLeads.length === 0) {
            stats.skipped++;
            continue;
          }

          // Update all matching leads (in case of duplicates)
          for (const lead of existingLeads) {
            // Check if lead has required fields
            if (!lead.service || !lead.zip) {
              stats.skipped++;
              continue;
            }

            // Get lead ID (handle both document and plain object)
            const leadId = (lead as any)._id?.toString() || (lead as any).id;
            if (!leadId) {
              stats.skipped++;
              continue;
            }

            // Only update if status or unqualifiedReason changed
            const needsUpdate =
              lead.status !== statusResult.status ||
              (lead.unqualifiedLeadReason || '') !== (statusResult.unqualifiedReason || '');

            if (needsUpdate) {
              try {
                await leadRepository.updateLead(
                  leadId,
                  {
                    status: statusResult.status,
                    unqualifiedLeadReason: statusResult.unqualifiedReason || ''
                  }
                );
                stats.updated++;
              } catch (updateError: any) {
                logger.error('[Lead Sheets Sync] Failed to update lead', {
                  leadId,
                  email,
                  error: updateError.message || String(updateError)
                });
                stats.errors++;
              }
            } else {
              stats.skipped++;
            }
          }
        } catch (error: any) {
          logger.error('[Lead Sheets Sync] Error processing opportunity', {
            opportunityId: opp.id,
            error: error.message || String(error)
          });
          stats.errors++;
        }
      }

      logger.info('[Lead Sheets Sync] Sync completed for client', {
        locationId,
        revenueProClientId,
        stats
      });

      return stats;
    } catch (error: any) {
      logger.error('[Lead Sheets Sync] Failed to sync client', {
        locationId,
        revenueProClientId,
        error: error.message || String(error)
      });
      throw error;
    }
  }

}

export default new LeadSheetsSyncService();

