import { leadRepository } from '../leads/repository/LeadRepository.js';
import { fbWeeklyAnalyticsRepository } from './repository/FbWeeklyAnalyticsRepository.js';
export async function getAdPerformanceBoard(params) {
    const { clientId, filters, columns, groupBy } = params;
    console.log('[AdPerformanceBoard] Starting with params:', {
        clientId,
        groupBy,
        dateRange: `${filters.startDate} to ${filters.endDate}`,
    });
    const startTime = Date.now();
    // Fetch saved weekly analytics from database
    const savedAnalytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(clientId, filters.startDate, filters.endDate);
    if (savedAnalytics.length === 0) {
        return { rows: [], availableZipCodes: [], availableServiceTypes: [] };
    }
    // Map DB fields (camelCase) to EnrichedAd interface (snake_case)
    const enrichedAds = savedAnalytics.map((analytics) => ({
        campaign_id: analytics.campaignId,
        campaign_name: analytics.campaignName,
        adset_id: analytics.adSetId,
        adset_name: analytics.adSetName,
        ad_id: analytics.adId,
        ad_name: analytics.adName,
        creative: analytics.creative ? {
            id: analytics.creative.id || null,
            name: analytics.creative.name || null,
            primary_text: analytics.creative.primaryText || null,
            headline: analytics.creative.headline || null,
            raw: analytics.creative.raw || null,
        } : null,
        lead_form: analytics.leadForm ? {
            id: analytics.leadForm.id,
            name: analytics.leadForm.name,
        } : null,
        insights: {
            impressions: analytics.metrics?.impressions || 0,
            clicks: analytics.metrics?.clicks || 0,
            spend: analytics.metrics?.spend || 0,
            date_start: analytics.weekStartDate,
            date_stop: analytics.weekEndDate,
        },
        // Store full metrics for aggregation
        _fullMetrics: analytics.metrics,
    }));
    // Step 2: Fetch leads from database
    const allLeads = await leadRepository.getLeadsByDateRangeAndClientId(clientId, filters.startDate, filters.endDate);
    // Collect all unique zip codes and service types from leads for filtering options
    const uniqueZipCodes = new Set();
    const uniqueServiceTypes = new Set();
    allLeads.forEach((lead) => {
        if (lead.zip) {
            uniqueZipCodes.add(lead.zip);
        }
        if (lead.service) {
            uniqueServiceTypes.add(lead.service);
        }
    });
    const availableZipCodes = Array.from(uniqueZipCodes).sort();
    const availableServiceTypes = Array.from(uniqueServiceTypes).sort();
    // Step 3: Apply lead filters
    let filteredLeads = allLeads;
    if (filters.estimateSetLeads === true) {
        filteredLeads = filteredLeads.filter((lead) => lead.status === 'estimate_set');
    }
    if (filters.jobBookedLeads === true) {
        filteredLeads = filteredLeads.filter((lead) => (lead.jobBookedAmount ?? 0) > 0);
    }
    if (filters.zipCode) {
        const zipCodes = Array.isArray(filters.zipCode) ? filters.zipCode : [filters.zipCode];
        filteredLeads = filteredLeads.filter((lead) => zipCodes.includes(lead.zip));
    }
    if (filters.serviceType) {
        const serviceTypes = Array.isArray(filters.serviceType)
            ? filters.serviceType
            : [filters.serviceType];
        filteredLeads = filteredLeads.filter((lead) => lead.service && serviceTypes.includes(lead.service));
    }
    if (filters.leadScore) {
        filteredLeads = filteredLeads.filter((lead) => {
            if (!lead.leadScore)
                return false;
            if (filters.leadScore.min !== undefined && lead.leadScore < filters.leadScore.min)
                return false;
            if (filters.leadScore.max !== undefined && lead.leadScore > filters.leadScore.max)
                return false;
            return true;
        });
    }
    // Step 4: Apply ad-level filters
    let filteredAds = enrichedAds;
    if (filters.campaignName) {
        const campaigns = Array.isArray(filters.campaignName)
            ? filters.campaignName
            : [filters.campaignName];
        filteredAds = filteredAds.filter((ad) => {
            if (!ad.campaign_name)
                return false;
            // Support partial, case-insensitive matching using regex
            return campaigns.some(searchTerm => {
                const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                return regex.test(ad.campaign_name);
            });
        });
    }
    if (filters.adSetName) {
        const adSets = Array.isArray(filters.adSetName)
            ? filters.adSetName
            : [filters.adSetName];
        filteredAds = filteredAds.filter((ad) => {
            if (!ad.adset_name)
                return false;
            // Support partial, case-insensitive matching using regex
            return adSets.some(searchTerm => {
                const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                return regex.test(ad.adset_name);
            });
        });
    }
    if (filters.adName) {
        const adNames = Array.isArray(filters.adName)
            ? filters.adName
            : [filters.adName];
        filteredAds = filteredAds.filter((ad) => {
            if (!ad.ad_name)
                return false;
            // Support partial, case-insensitive matching using regex
            return adNames.some(searchTerm => {
                const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                return regex.test(ad.ad_name);
            });
        });
    }
    // Step 5: BUILD THE MAPS (ad name → campaign/adset)
    const adNameToCampaignMap = new Map();
    const adNameToAdSetMap = new Map();
    filteredAds.forEach((ad) => {
        adNameToCampaignMap.set(ad.ad_name, ad.campaign_name);
        adNameToAdSetMap.set(ad.ad_name, ad.adset_name);
    });
    // Step 6: Build aggregation map
    const aggregationMap = new Map();
    // First, process ads to get spend data
    filteredAds.forEach((ad) => {
        let groupKey;
        let rowData = {};
        switch (groupBy) {
            case 'campaign':
                groupKey = ad.campaign_name || 'Unknown Campaign';
                rowData.campaignName = ad.campaign_name;
                break;
            case 'adset':
                groupKey = `${ad.campaign_name}|${ad.adset_name}`;
                rowData.campaignName = ad.campaign_name;
                rowData.adSetName = ad.adset_name;
                break;
            case 'ad':
                groupKey = `${ad.campaign_name}|${ad.adset_name}|${ad.ad_name}`;
                rowData.campaignName = ad.campaign_name;
                rowData.adSetName = ad.adset_name;
                rowData.adName = ad.ad_name;
                break;
            default:
                groupKey = ad.ad_name || 'Unknown Ad';
        }
        if (!aggregationMap.has(groupKey)) {
            aggregationMap.set(groupKey, {
                ...rowData,
                _groupKey: groupKey,
                _totalSpend: 0,
                _totalRevenue: 0,
                _totalImpressions: 0,
                _services: new Set(),
                _zipCodes: new Set(),
                _totalClicks: 0,
                _totalUniqueClicks: 0,
                _totalReach: 0,
                _totalFrequency: 0,
                _totalCtr: 0,
                _totalUniqueClickThroughRate: 0,
                _totalCostPerClick: 0,
                _totalCostPerThousandImpressions: 0,
                _totalCostPerThousandReach: 0,
                _totalPostEngagements: 0,
                _totalPostReactions: 0,
                _totalPostComments: 0,
                _totalPostShares: 0,
                _totalPostSaves: 0,
                _totalPageEngagements: 0,
                _totalLinkClicks: 0,
                _totalVideoViews: 0,
                _totalVideoViews25: 0,
                _totalVideoViews50: 0,
                _totalVideoViews75: 0,
                _totalVideoViews100: 0,
                _totalVideoAvgWatchTime: 0,
                _totalVideoPlayActions: 0,
                _totalConversions: 0,
                _totalConversionValue: 0,
                _totalCostPerConversion: 0,
                _totalLeads: 0,
                _totalCostPerLead: 0,
                _count: 0,
                numberOfLeads: 0,
                numberOfEstimateSets: 0,
                numberOfJobsBooked: 0,
                numberOfUnqualifiedLeads: 0,
            });
        }
        const row = aggregationMap.get(groupKey);
        const metrics = ad._fullMetrics || {};
        // Sum basic metrics
        row._totalSpend = (row._totalSpend || 0) + (metrics.spend || 0);
        row._totalImpressions = (row._totalImpressions || 0) + (metrics.impressions || 0);
        row._totalClicks = (row._totalClicks || 0) + (metrics.clicks || 0);
        row._totalUniqueClicks = (row._totalUniqueClicks || 0) + (metrics.unique_clicks || 0);
        row._totalReach = (row._totalReach || 0) + (metrics.reach || 0);
        // Sum pre-calculated metrics from DB (for averaging later)
        row._totalFrequency = (row._totalFrequency || 0) + (metrics.frequency || 0);
        row._totalCtr = (row._totalCtr || 0) + (metrics.ctr || 0);
        row._totalUniqueClickThroughRate = (row._totalUniqueClickThroughRate || 0) + (metrics.unique_ctr || 0);
        row._totalCostPerClick = (row._totalCostPerClick || 0) + (metrics.cpc || 0);
        row._totalCostPerThousandImpressions = (row._totalCostPerThousandImpressions || 0) + (metrics.cpm || 0);
        row._totalCostPerThousandReach = (row._totalCostPerThousandReach || 0) + (metrics.cpr || 0);
        // Sum engagement metrics
        row._totalPostEngagements = (row._totalPostEngagements || 0) + (metrics.post_engagements || 0);
        row._totalPostReactions = (row._totalPostReactions || 0) + (metrics.post_reactions || 0);
        row._totalPostComments = (row._totalPostComments || 0) + (metrics.post_comments || 0);
        row._totalPostShares = (row._totalPostShares || 0) + (metrics.post_shares || 0);
        row._totalPostSaves = (row._totalPostSaves || 0) + (metrics.post_saves || 0);
        row._totalPageEngagements = (row._totalPageEngagements || 0) + (metrics.page_engagements || 0);
        row._totalLinkClicks = (row._totalLinkClicks || 0) + (metrics.link_clicks || 0);
        // Sum video metrics
        row._totalVideoViews = (row._totalVideoViews || 0) + (metrics.video_views || 0);
        row._totalVideoViews25 = (row._totalVideoViews25 || 0) + (metrics.video_views_25pct || 0);
        row._totalVideoViews50 = (row._totalVideoViews50 || 0) + (metrics.video_views_50pct || 0);
        row._totalVideoViews75 = (row._totalVideoViews75 || 0) + (metrics.video_views_75pct || 0);
        row._totalVideoViews100 = (row._totalVideoViews100 || 0) + (metrics.video_views_100pct || 0);
        row._totalVideoAvgWatchTime = (row._totalVideoAvgWatchTime || 0) + (metrics.video_avg_watch_time || 0);
        row._totalVideoPlayActions = (row._totalVideoPlayActions || 0) + (metrics.video_play_actions || 0);
        // Sum conversion metrics
        row._totalConversions = (row._totalConversions || 0) + (metrics.total_conversions || 0);
        row._totalConversionValue = (row._totalConversionValue || 0) + (metrics.conversion_value || 0);
        row._totalCostPerConversion = (row._totalCostPerConversion || 0) + (metrics.cost_per_conversion || 0);
        row._totalLeads = (row._totalLeads || 0) + (metrics.total_leads || 0);
        row._totalCostPerLead = (row._totalCostPerLead || 0) + (metrics.cost_per_lead || 0);
        // Increment count for averaging
        row._count = (row._count || 0) + 1;
    });
    // Step 7: USE THE MAPS TO PROCESS LEADS
    filteredLeads.forEach((lead) => {
        // Look up campaign name from the map using ad name
        const campaignName = adNameToCampaignMap.get(lead.adName);
        // Use lead's adSetName if available, otherwise look up from map
        const adSetName = lead.adSetName || adNameToAdSetMap.get(lead.adName);
        // Skip leads that don't have matching analytics data
        // This happens when leads reference ads that aren't in the saved analytics
        if (!campaignName || !adSetName) {
            console.log(`[AdPerformanceBoard] Skipping lead - no analytics found for ad: ${lead.adName}`);
            return;
        }
        let groupKey;
        switch (groupBy) {
            case 'campaign':
                groupKey = campaignName;
                break;
            case 'adset':
                groupKey = `${campaignName}|${adSetName}`;
                break;
            case 'ad':
                groupKey = `${campaignName}|${adSetName}|${lead.adName}`;
                break;
            default:
                groupKey = lead.adName || 'Unknown Ad';
        }
        // If this group doesn't exist in ad data, create it
        if (!aggregationMap.has(groupKey)) {
            const rowData = {};
            if (groupBy === 'campaign' || groupBy === 'adset' || groupBy === 'ad') {
                rowData.campaignName = campaignName;
            }
            if (groupBy === 'adset' || groupBy === 'ad') {
                rowData.adSetName = adSetName;
            }
            if (groupBy === 'ad') {
                rowData.adName = lead.adName;
            }
            aggregationMap.set(groupKey, {
                ...rowData,
                _groupKey: groupKey,
                _totalSpend: 0,
                _totalRevenue: 0,
                _services: new Set(),
                _zipCodes: new Set(),
                numberOfLeads: 0,
                numberOfEstimateSets: 0,
                numberOfJobsBooked: 0,
                numberOfUnqualifiedLeads: 0,
            });
        }
        const row = aggregationMap.get(groupKey);
        // Collect service and zip code
        if (lead.service) {
            row._services = row._services || new Set();
            row._services.add(lead.service);
        }
        if (lead.zip) {
            row._zipCodes = row._zipCodes || new Set();
            row._zipCodes.add(lead.zip);
        }
        // Count leads
        row.numberOfLeads = (row.numberOfLeads || 0) + 1;
        // Count estimate sets
        if (lead.status === 'estimate_set') {
            row.numberOfEstimateSets = (row.numberOfEstimateSets || 0) + 1;
        }
        // Count jobs booked and revenue
        if ((lead.jobBookedAmount ?? 0) > 0) {
            row.numberOfJobsBooked = (row.numberOfJobsBooked || 0) + 1;
            row._totalRevenue = (row._totalRevenue || 0) + lead.jobBookedAmount;
        }
        // Count unqualified leads
        if (lead.status === 'unqualified') {
            row.numberOfUnqualifiedLeads = (row.numberOfUnqualifiedLeads || 0) + 1;
        }
    });
    // Step 8: Aggregate metrics from DB (use pre-calculated values from saveWeeklyAnalytics)
    aggregationMap.forEach((row) => {
        const totalSpend = row._totalSpend || 0;
        const totalRevenue = row._totalRevenue || 0;
        const totalImpressions = row._totalImpressions || 0;
        const totalClicks = row._totalClicks || 0;
        const totalReach = row._totalReach || 0;
        const totalLeads = row.numberOfLeads || 0;
        const estimateSets = row.numberOfEstimateSets || 0;
        const jobsBooked = row.numberOfJobsBooked || 0;
        const count = row._count || 1; // Number of weekly records aggregated
        // Basic metrics (directly from DB)
        row.spend = Number(totalSpend.toFixed(2));
        row.impressions = totalImpressions;
        row.clicks = totalClicks;
        row.unique_clicks = row._totalUniqueClicks || 0;
        row.reach = totalReach;
        // Average pre-calculated metrics from DB (these were calculated during save)
        row.frequency = count > 0 ? Number(((row._totalFrequency || 0) / count).toFixed(2)) : 0;
        row.ctr = count > 0 ? Number(((row._totalCtr || 0) / count).toFixed(2)) : 0;
        row.unique_ctr = count > 0 ? Number(((row._totalUniqueClickThroughRate || 0) / count).toFixed(6)) : 0;
        row.cpc = count > 0 ? Number(((row._totalCostPerClick || 0) / count).toFixed(6)) : 0;
        row.cpm = count > 0 ? Number(((row._totalCostPerThousandImpressions || 0) / count).toFixed(6)) : 0;
        row.cpr = count > 0 ? Number(((row._totalCostPerThousandReach || 0) / count).toFixed(6)) : 0;
        // Engagement metrics (from DB)
        row.post_engagements = row._totalPostEngagements || 0;
        row.post_reactions = row._totalPostReactions || 0;
        row.post_comments = row._totalPostComments || 0;
        row.post_shares = row._totalPostShares || 0;
        row.post_saves = row._totalPostSaves || 0;
        row.page_engagements = row._totalPageEngagements || 0;
        row.link_clicks = row._totalLinkClicks || 0;
        // Video metrics (from DB)
        row.video_views = row._totalVideoViews || 0;
        row.video_views_25pct = row._totalVideoViews25 || 0;
        row.video_views_50pct = row._totalVideoViews50 || 0;
        row.video_views_75pct = row._totalVideoViews75 || 0;
        row.video_views_100pct = row._totalVideoViews100 || 0;
        row.video_avg_watch_time = row._totalVideoAvgWatchTime || 0;
        row.video_play_actions = row._totalVideoPlayActions || 0;
        // Conversion metrics (from DB)
        row.total_conversions = row._totalConversions || 0;
        row.conversion_value = row._totalConversionValue || 0;
        row.cost_per_conversion = row._totalCostPerConversion || 0;
        row.total_leads = row._totalLeads || 0;
        row.cost_per_lead = row._totalCostPerLead || 0;
        // Lead cost metrics (calculate only lead-related costs)
        row.costPerLead = totalLeads > 0 ? Number((totalSpend / totalLeads).toFixed(2)) : null;
        row.costPerEstimateSet = estimateSets > 0 ? Number((totalSpend / estimateSets).toFixed(2)) : null;
        row.costPerJobBooked = jobsBooked > 0 ? Number((totalSpend / jobsBooked).toFixed(2)) : null;
        row.costOfMarketingPercent = totalRevenue > 0 ? Number(((totalSpend / totalRevenue) * 100).toFixed(2)) : null;
        // Convert service and zipCode sets to comma-separated strings
        row.service = row._services && row._services.size > 0 ? Array.from(row._services).sort().join(', ') : undefined;
        row.zipCode = row._zipCodes && row._zipCodes.size > 0 ? Array.from(row._zipCodes).sort().join(', ') : undefined;
    });
    // Step 9: Filter columns based on requested fields
    const results = [];
    aggregationMap.forEach((row) => {
        const filteredRow = {};
        // Dimension columns
        if (columns.campaignName)
            filteredRow.campaignName = row.campaignName;
        if (columns.adSetName)
            filteredRow.adSetName = row.adSetName;
        if (columns.adName)
            filteredRow.adName = row.adName;
        if (columns.service)
            filteredRow.service = row.service;
        if (columns.zipCode)
            filteredRow.zipCode = row.zipCode;
        // Basic metrics
        if (columns.spend)
            filteredRow.spend = row.spend;
        if (columns.impressions)
            filteredRow.impressions = row.impressions;
        if (columns.clicks)
            filteredRow.clicks = row.clicks;
        if (columns.unique_clicks)
            filteredRow.unique_clicks = row.unique_clicks;
        if (columns.reach)
            filteredRow.reach = row.reach;
        if (columns.frequency)
            filteredRow.frequency = row.frequency;
        // CTR metrics
        if (columns.ctr)
            filteredRow.ctr = row.ctr;
        if (columns.unique_ctr)
            filteredRow.unique_ctr = row.unique_ctr;
        // Cost metrics
        if (columns.cpc)
            filteredRow.cpc = row.cpc;
        if (columns.cpm)
            filteredRow.cpm = row.cpm;
        if (columns.cpr)
            filteredRow.cpr = row.cpr;
        // Engagement metrics
        if (columns.post_engagements)
            filteredRow.post_engagements = row.post_engagements;
        if (columns.post_reactions)
            filteredRow.post_reactions = row.post_reactions;
        if (columns.post_comments)
            filteredRow.post_comments = row.post_comments;
        if (columns.post_shares)
            filteredRow.post_shares = row.post_shares;
        if (columns.post_saves)
            filteredRow.post_saves = row.post_saves;
        if (columns.page_engagements)
            filteredRow.page_engagements = row.page_engagements;
        if (columns.link_clicks)
            filteredRow.link_clicks = row.link_clicks;
        // Video metrics
        if (columns.video_views)
            filteredRow.video_views = row.video_views;
        if (columns.video_views_25pct)
            filteredRow.video_views_25pct = row.video_views_25pct;
        if (columns.video_views_50pct)
            filteredRow.video_views_50pct = row.video_views_50pct;
        if (columns.video_views_75pct)
            filteredRow.video_views_75pct = row.video_views_75pct;
        if (columns.video_views_100pct)
            filteredRow.video_views_100pct = row.video_views_100pct;
        if (columns.video_avg_watch_time)
            filteredRow.video_avg_watch_time = row.video_avg_watch_time;
        if (columns.video_play_actions)
            filteredRow.video_play_actions = row.video_play_actions;
        // Conversion metrics
        if (columns.total_conversions)
            filteredRow.total_conversions = row.total_conversions;
        if (columns.conversion_value)
            filteredRow.conversion_value = row.conversion_value;
        if (columns.cost_per_conversion)
            filteredRow.cost_per_conversion = row.cost_per_conversion;
        if (columns.total_leads)
            filteredRow.total_leads = row.total_leads;
        if (columns.cost_per_lead)
            filteredRow.cost_per_lead = row.cost_per_lead;
        // Lead metrics
        if (columns.numberOfLeads)
            filteredRow.numberOfLeads = row.numberOfLeads;
        if (columns.numberOfEstimateSets)
            filteredRow.numberOfEstimateSets = row.numberOfEstimateSets;
        if (columns.numberOfJobsBooked)
            filteredRow.numberOfJobsBooked = row.numberOfJobsBooked;
        if (columns.numberOfUnqualifiedLeads)
            filteredRow.numberOfUnqualifiedLeads = row.numberOfUnqualifiedLeads;
        // Lead cost metrics
        if (columns.costPerLead)
            filteredRow.costPerLead = row.costPerLead;
        if (columns.costPerEstimateSet)
            filteredRow.costPerEstimateSet = row.costPerEstimateSet;
        if (columns.costPerJobBooked)
            filteredRow.costPerJobBooked = row.costPerJobBooked;
        if (columns.costOfMarketingPercent)
            filteredRow.costOfMarketingPercent = row.costOfMarketingPercent;
        // Store internal fields for sorting
        filteredRow._totalSpend = row._totalSpend;
        results.push(filteredRow);
    });
    // Sort by spend descending (most expensive first)
    results.sort((a, b) => {
        const spendA = a._totalSpend || 0;
        const spendB = b._totalSpend || 0;
        return spendB - spendA;
    });
    // Remove internal fields before returning
    results.forEach((row) => {
        delete row._totalSpend;
    });
    console.log(`[AdPerformanceBoard] Returning ${results.length} rows`);
    const elapsed = Date.now() - startTime;
    console.log(`[AdPerformanceBoard] Completed in ${elapsed}ms`);
    return {
        rows: results,
        availableZipCodes,
        availableServiceTypes
    };
}
