import http from '../../../pkg/http/client.js';
import { config } from '../../../config.js';
import ghlClientService from '../../ghlClient/service/service.js';
import { LeadService } from './LeadService.js';
import { leadRepository } from '../repository/LeadRepository.js';
import logger from '../../../utils/logger.js';
// Tag mappings
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
async function withRetry(fn, { retries, baseDelayMs }) {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        }
        catch (err) {
            attempt += 1;
            if (attempt > retries)
                throw err;
            const backoff = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * (backoff / 2));
            const sleep = backoff + jitter;
            await new Promise((r) => setTimeout(r, sleep));
        }
    }
}
async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Collect all tags from an opportunity
 */
function collectTags(opportunity) {
    const tags = [];
    // Collect from contact tags
    if (Array.isArray(opportunity.contact?.tags)) {
        tags.push(...opportunity.contact.tags);
    }
    // Collect from relations tags
    if (Array.isArray(opportunity.relations)) {
        for (const rel of opportunity.relations) {
            if (Array.isArray(rel?.tags)) {
                tags.push(...rel.tags);
            }
        }
    }
    return tags;
}
/**
 * Determine lead status based on tags with priority:
 * unqualified > estimate_set > in_progress > new_lead
 *
 * Only processes tags that are in ALL_ALLOWED_TAGS (unknown tags are ignored)
 * Requires "facebook lead" tag to be present (returns null if missing)
 * For 'new' status, requires BOTH 'new_lead' AND 'facebook lead' tags
 */
function determineLeadStatus(tags) {
    // Define all allowed tags (unknown tags will be filtered out)
    const ALL_ALLOWED_TAGS = [
        ...NEW_LEAD_TAGS,
        ...IN_PROGRESS_TAGS,
        ...ESTIMATE_SET_TAGS,
        ...UNQUALIFIED_TAGS,
    ];
    // Normalize tags to lowercase and filter to only allowed tags
    const lowerTags = tags.map(t => String(t).toLowerCase().trim());
    const allowedTags = lowerTags.filter(tag => ALL_ALLOWED_TAGS.some(allowed => allowed.toLowerCase() === tag));
    const tagSet = new Set(allowedTags);
    // Mandatory check: "facebook lead" tag must be present
    if (!tagSet.has('facebook lead')) {
        return null; // Skip this lead
    }
    // Check for unqualified tags (highest priority)
    for (const unqualifiedTag of UNQUALIFIED_TAGS) {
        if (tagSet.has(unqualifiedTag.toLowerCase())) {
            return {
                status: 'unqualified',
                unqualifiedReason: unqualifiedTag
            };
        }
    }
    // Check for estimate_set tags
    for (const estimateTag of ESTIMATE_SET_TAGS) {
        if (tagSet.has(estimateTag.toLowerCase())) {
            return { status: 'estimate_set' };
        }
    }
    // Check for in_progress tags
    for (const progressTag of IN_PROGRESS_TAGS) {
        if (tagSet.has(progressTag.toLowerCase())) {
            return { status: 'in_progress' };
        }
    }
    // Check for new_lead status - requires BOTH 'new_lead' AND 'facebook lead' tags
    if (tagSet.has('new_lead') && tagSet.has('facebook lead')) {
        return { status: 'new' };
    }
    // If we reach here, the opportunity has 'facebook lead' but doesn't match any status category
    // This should not happen in normal flow, but return null to skip
    return null;
}
export class LeadSheetsSyncService {
    constructor() {
        this.httpClient = new http(config.GHL_BASE_URL, 15000);
        this.leadService = new LeadService();
    }
    /**
     * Fetch opportunities from GHL API for a specific location
     */
    async fetchOpportunities(locationId, apiToken) {
        let url = `/opportunities/search?location_id=${encodeURIComponent(locationId)}`;
        const aggregated = [];
        let lastMeta = { total: 0 };
        while (url) {
            const page = await this.httpClient.get(url, {
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    Version: '2021-07-28',
                },
            });
            if (page?.opportunities?.length) {
                aggregated.push(...page.opportunities);
            }
            lastMeta = page?.meta || lastMeta;
            const nextUrl = page?.meta?.nextPageUrl;
            url = nextUrl && nextUrl.length > 0 ? nextUrl : null;
        }
        return { opportunities: aggregated, meta: { ...lastMeta, total: aggregated.length } };
    }
    /**
     * Fetch contact and extract queryValue (customFieldId) value
     * Returns the value if found, null otherwise
     */
    async getContactQueryValue(contactId, locationId, apiToken, customFieldId, retry = { retries: 3, baseDelayMs: 1000 }) {
        if (!customFieldId) {
            logger.debug('[Lead Sheets Sync] No customFieldId provided, skipping queryValue fetch', {
                locationId,
                contactId,
            });
            return null;
        }
        try {
            const resp = await withRetry(async () => {
                try {
                    return await this.httpClient.get(`/contacts/${encodeURIComponent(contactId)}`, {
                        headers: {
                            Authorization: `Bearer ${apiToken}`,
                            Version: '2021-07-28',
                        },
                    });
                }
                catch (error) {
                    // If we get a 429, throw a specific error that can be handled
                    if (error?.message?.includes('429') || error?.code === 429) {
                        const rateLimitError = new Error('Rate limit exceeded');
                        rateLimitError.code = 429;
                        throw rateLimitError;
                    }
                    throw error;
                }
            }, retry);
            const contact = resp?.contact;
            if (!contact)
                return null;
            const customFields = contact?.customFields;
            if (Array.isArray(customFields)) {
                const field = customFields.find((f) => f?.id === customFieldId || f?._id === customFieldId);
                if (field && field.value !== undefined && field.value !== null && field.value !== '') {
                    const val = Number(field.value);
                    if (!Number.isNaN(val)) {
                        return val;
                    }
                }
            }
            return null;
        }
        catch (e) {
            logger.warn('[Lead Sheets Sync] Failed to fetch contact for queryValue', {
                locationId,
                contactId,
                error: e?.message || String(e),
            });
            return null;
        }
    }
    /**
     * Process opportunities and sync lead statuses
     */
    async syncLeadSheetsForClient(locationId, pipelineId, revenueProClientId, apiToken, customFieldId) {
        const stats = {
            processed: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
        };
        try {
            // Fetch all opportunities
            const ghlResponse = await this.fetchOpportunities(locationId, apiToken);
            const opportunities = ghlResponse.opportunities || [];
            logger.info('[Lead Sheets Sync] Fetched opportunities', {
                locationId,
                revenueProClientId,
                totalOpportunities: opportunities.length,
            });
            // Process all opportunities from all pipelines
            logger.info('[Lead Sheets Sync] Processing all pipelines', {
                locationId,
                revenueProClientId,
                totalOpportunities: opportunities.length,
            });
            // Process each opportunity
            for (const opportunity of opportunities) {
                try {
                    const email = opportunity.contact?.email;
                    // Skip if no email
                    if (!email || !email.trim()) {
                        stats.skipped++;
                        continue;
                    }
                    // Collect tags
                    const tags = collectTags(opportunity);
                    // Determine status (returns null if "facebook lead" tag is missing)
                    const statusResult = determineLeadStatus(tags);
                    // Skip if "facebook lead" tag is not present
                    if (!statusResult) {
                        stats.skipped++;
                        logger.debug('[Lead Sheets Sync] Opportunity missing "facebook lead" tag, skipping', {
                            locationId,
                            revenueProClientId,
                            email: email.trim(),
                        });
                        continue;
                    }
                    const { status, unqualifiedReason } = statusResult;
                    // Find existing lead by email and clientId
                    const existingLeads = await leadRepository.findLeads({
                        email: email.trim(),
                        clientId: revenueProClientId,
                    });
                    // Skip if lead doesn't exist in DB
                    if (!existingLeads || existingLeads.length === 0) {
                        stats.skipped++;
                        logger.debug('[Lead Sheets Sync] Lead not found in DB, skipping', {
                            locationId,
                            revenueProClientId,
                            email: email.trim(),
                        });
                        continue;
                    }
                    // Get the first matching lead
                    const existingLead = existingLeads[0];
                    // Ensure required fields exist
                    if (!existingLead.service || !existingLead.zip) {
                        stats.skipped++;
                        logger.debug('[Lead Sheets Sync] Lead missing required fields, skipping', {
                            locationId,
                            revenueProClientId,
                            email: email.trim(),
                            hasService: !!existingLead.service,
                            hasZip: !!existingLead.zip,
                        });
                        continue;
                    }
                    // Prepare lead data - only update status and unqualified reason
                    const leadData = {
                        status: status,
                        unqualifiedLeadReason: unqualifiedReason || '',
                    };
                    // Only fetch queryValue when lead CONVERTS to estimate_set (current status is NOT estimate_set)
                    const isConvertingToEstimateSet = status === 'estimate_set' && existingLead.status !== 'estimate_set';
                    if (isConvertingToEstimateSet && opportunity.contactId) {
                        const retry = { retries: 3, baseDelayMs: 1000 };
                        const queryValue = await this.getContactQueryValue(opportunity.contactId, locationId, apiToken, customFieldId, retry);
                        if (queryValue !== null) {
                            leadData.jobBookedAmount = queryValue;
                            logger.debug('[Lead Sheets Sync] Fetched queryValue from contact for converting lead', {
                                locationId,
                                revenueProClientId,
                                email: email.trim(),
                                contactId: opportunity.contactId,
                                currentStatus: existingLead.status,
                                newStatus: status,
                                queryValue,
                            });
                        }
                        else {
                            logger.debug('[Lead Sheets Sync] Could not fetch queryValue from contact', {
                                locationId,
                                revenueProClientId,
                                email: email.trim(),
                                contactId: opportunity.contactId,
                                customFieldId,
                            });
                        }
                        // Small delay between contact fetches to avoid rate limits
                        await delay(30);
                    }
                    // Update lead using the existing lead's query fields
                    const query = {
                        email: email.trim(),
                        clientId: revenueProClientId,
                        service: existingLead.service,
                        zip: existingLead.zip,
                    };
                    await this.leadService.upsertLead(query, leadData);
                    stats.updated++;
                    stats.processed++;
                    logger.debug('[Lead Sheets Sync] Processed lead', {
                        locationId,
                        revenueProClientId,
                        email: email.trim(),
                        status,
                        unqualifiedReason,
                        tags,
                    });
                }
                catch (error) {
                    stats.errors++;
                    logger.error('[Lead Sheets Sync] Error processing opportunity', {
                        locationId,
                        revenueProClientId,
                        opportunityId: opportunity.id,
                        error: error?.message || String(error),
                    });
                }
            }
            logger.info('[Lead Sheets Sync] Completed sync', {
                locationId,
                revenueProClientId,
                stats,
            });
            return stats;
        }
        catch (error) {
            logger.error('[Lead Sheets Sync] Failed to sync', {
                locationId,
                revenueProClientId,
                error: error?.message || String(error),
            });
            throw error;
        }
    }
    /**
     * Sync lead sheets for all active GHL clients
     */
    async syncAllClients() {
        const clients = await ghlClientService.getAllActiveGhlClients();
        if (!clients || clients.length === 0) {
            logger.warn('[Lead Sheets Sync] No active GHL clients found');
            return;
        }
        logger.info('[Lead Sheets Sync] Starting sync for all clients', {
            clientCount: clients.length,
        });
        const retry = { retries: 3, baseDelayMs: 1000 };
        const perClientDelayMs = 1000; // 1s between clients
        for (const client of clients) {
            const locationId = client.locationId;
            const decryptedToken = ghlClientService.getDecryptedApiToken(client);
            const pipelineId = client.pipelineId;
            const revenueProClientId = client.revenueProClientId;
            const customFieldId = client.customFieldId;
            if (!locationId || !decryptedToken || !pipelineId || !revenueProClientId) {
                logger.warn('[Lead Sheets Sync] Skipping client due to missing required fields', {
                    locationId,
                    hasToken: !!decryptedToken,
                    hasPipelineId: !!pipelineId,
                    revenueProClientId,
                });
                await delay(perClientDelayMs);
                continue;
            }
            try {
                const stats = await withRetry(() => this.syncLeadSheetsForClient(locationId, pipelineId, revenueProClientId, decryptedToken, customFieldId), retry);
                logger.info('[Lead Sheets Sync] Client sync completed', {
                    locationId,
                    revenueProClientId,
                    stats,
                });
            }
            catch (error) {
                logger.error('[Lead Sheets Sync] Client sync failed', {
                    locationId,
                    revenueProClientId,
                    error: error?.message || String(error),
                });
            }
            // Delay between clients
            await delay(perClientDelayMs);
        }
        logger.info('[Lead Sheets Sync] Completed sync for all clients');
    }
}
export default new LeadSheetsSyncService();
