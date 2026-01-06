// adPerformanceBoard.service.ts
import { LeadService } from '../leads/service/LeadService.js';
import { leadRepository } from '../leads/repository/LeadRepository.js';
import { fbWeeklyAnalyticsRepository } from './repository/FbWeeklyAnalyticsRepository.js';
import { creativesRepository } from '../creatives/repository/CreativesRepository.js';
import { 
  EnrichedAd, 
  BoardFilters, 
  BoardColumns, 
  BoardRow, 
  BoardParams, 
  BoardResponse 
} from './domain/facebookAds.domain.js';

export async function getAdPerformanceBoard(
  params: BoardParams
): Promise<BoardResponse> {
  const { clientId, filters, columns, groupBy } = params;

  // Fetch saved weekly analytics from database
  const savedAnalytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
    clientId,
    filters.startDate,
    filters.endDate
  );

  if (savedAnalytics.length === 0) {
    return {
      rows: [],
      averages: {
        fb_frequency: 0,
        fb_ctr: 0,
        fb_unique_ctr: 0,
        fb_cpc: 0,
        fb_cpm: 0,
        fb_cpr: 0,
        fb_cost_per_conversion: 0,
        fb_cost_per_lead: 0,
        costPerLead: 0,
        costPerEstimateSet: 0,
        costPerJobBooked: 0,
        costOfMarketingPercent: 0,
        estimateSetRate:0,
      },
      availableZipCodes: [],
      availableServiceTypes: []
    };
  }

  // Step 1.5: Fetch creatives from creatives collection
  const creativeIds = savedAnalytics
    .map(a => a.creative?.id)
    .filter((id): id is string => !!id);
  
  const uniqueCreativeIds = Array.from(new Set(creativeIds));
  
  let creativesMap: Record<string, any> = {};
  if (uniqueCreativeIds.length > 0) {
    try {
      const creatives = await creativesRepository.getCreativesByIds(uniqueCreativeIds);
      creatives.forEach(c => {
        creativesMap[c.creativeId] = c;
      });
      console.log(`[AdPerformanceBoard] Loaded ${Object.keys(creativesMap).length} creatives from database`);
    } catch (error) {
      console.error('[AdPerformanceBoard] Failed to load creatives:', error);
      // Continue without enriched creative data
    }
  }

  // Map DB fields (camelCase) to EnrichedAd interface (snake_case)
  const enrichedAds: EnrichedAd[] = savedAnalytics.map((analytics) => {
    const creativeId = analytics.creative?.id;
    const enrichedCreative = creativeId ? creativesMap[creativeId] : null;

    return {
      campaign_id: analytics.campaignId,
      campaign_name: analytics.campaignName,
      adset_id: analytics.adSetId,
      adset_name: analytics.adSetName,
      ad_id: analytics.adId,
      ad_name: analytics.adName,
      creative: analytics.creative ? {
        id: analytics.creative.id || null,
        name: enrichedCreative?.name || analytics.creative.name || null,
        primary_text: enrichedCreative?.primaryText || analytics.creative.primaryText || null,
        headline: enrichedCreative?.headline || analytics.creative.headline || null,
        raw: analytics.creative.raw || null,
        // Add enriched creative data from creatives collection
        ...(enrichedCreative && {
          thumbnailUrl: enrichedCreative.thumbnailUrl,
          imageUrl: enrichedCreative.imageUrl,
          imageHash: enrichedCreative.imageHash,
          videoId: enrichedCreative.videoId,
          creativeType: enrichedCreative.creativeType,
          images: enrichedCreative.images,
          videos: enrichedCreative.videos,
          childAttachments: enrichedCreative.childAttachments,
          callToAction: enrichedCreative.callToAction,
          description: enrichedCreative.description,
          body: enrichedCreative.body,
        })
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
    } as any;
  });


  // Step 2: Fetch leads from database
  const allLeads = await leadRepository.getLeadsByDateRangeAndClientId(
    clientId,
    filters.startDate,
    filters.endDate
  );


  // Collect all unique zip codes and service types from leads for filtering options
  const uniqueZipCodes = new Set<string>();
  const uniqueServiceTypes = new Set<string>();
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
    filteredLeads = filteredLeads.filter((lead) =>
      lead.service && serviceTypes.includes(lead.service)
    );
  }

  if (filters.leadScore) {
    filteredLeads = filteredLeads.filter((lead) => {
      if (!lead.leadScore) return false;
      if (filters.leadScore!.min !== undefined && lead.leadScore < filters.leadScore!.min)
        return false;
      if (filters.leadScore!.max !== undefined && lead.leadScore > filters.leadScore!.max)
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
      if (!ad.campaign_name) return false;
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
      if (!ad.adset_name) return false;
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
      if (!ad.ad_name) return false;
      // Support partial, case-insensitive matching using regex
      return adNames.some(searchTerm => {
        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return regex.test(ad.ad_name);
      });
    });
  }

  // Step 5: BUILD THE MAPS (ad name → campaign/adset)
  const adNameToCampaignMap = new Map<string, string>();
  const adNameToAdSetMap = new Map<string, string>();

  filteredAds.forEach((ad) => {
    adNameToCampaignMap.set(ad.ad_name, ad.campaign_name);
    adNameToAdSetMap.set(ad.ad_name, ad.adset_name);
  });


  // Step 6: Build aggregation map
  const aggregationMap = new Map<string, BoardRow>();

  // First, process ads to get spend data
  filteredAds.forEach((ad) => {
    let groupKey: string;
    let rowData: Partial<BoardRow> = {};

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
        // Include creative data when grouping by ad
        if (ad.creative) {
          (rowData as any).creative = ad.creative;
        }
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
        _services: new Set<string>(),
        _zipCodes: new Set<string>(),
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
        numberOfVirtualQuotes: 0,
        numberOfEstimateCanceled: 0,
        numberOfProposalPresented: 0,
        numberOfJobLost: 0,
      });
    }

    const row = aggregationMap.get(groupKey)!;
    const metrics = (ad as any)._fullMetrics || {};
    
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
      return;
    }

    let groupKey: string;

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
      const rowData: Partial<BoardRow> = {};
      
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
        _services: new Set<string>(),
        _zipCodes: new Set<string>(),
        numberOfLeads: 0,
        numberOfEstimateSets: 0,
        numberOfJobsBooked: 0,
        numberOfUnqualifiedLeads: 0,
        numberOfVirtualQuotes: 0,
        numberOfEstimateCanceled: 0,
        numberOfProposalPresented: 0,
        numberOfJobLost: 0,
      });
    }

    const row = aggregationMap.get(groupKey)!;

    // Collect service and zip code
    if (lead.service) {
      row._services = row._services || new Set<string>();
      row._services.add(lead.service);
    }
    if (lead.zip) {
      row._zipCodes = row._zipCodes || new Set<string>();
      row._zipCodes.add(lead.zip);
    }

    // Count leads
    row.numberOfLeads = (row.numberOfLeads || 0) + 1;

    // Count estimate sets
    if (lead.status === 'estimate_set') {
      row.numberOfEstimateSets = (row.numberOfEstimateSets || 0) + 1;
    }

    // Count virtual quotes
    if (lead.status === 'virtual_quote') {
      row.numberOfVirtualQuotes = (row.numberOfVirtualQuotes || 0) + 1;
    }

    // Count proposal presented
    if (lead.status === 'proposal_presented') {
      row.numberOfProposalPresented = (row.numberOfProposalPresented || 0) + 1;
    }

    // Count jobs booked by status OR by amount (whichever indicates job was booked)
    if (lead.status === 'job_booked' || (lead.jobBookedAmount ?? 0) > 0) {
      row.numberOfJobsBooked = (row.numberOfJobsBooked || 0) + 1;
    }

    // Track revenue separately
    if ((lead.jobBookedAmount ?? 0) > 0) {
      row._totalRevenue = (row._totalRevenue || 0) + lead.jobBookedAmount!;
    }

    // Count unqualified leads
    if (lead.status === 'unqualified') {
      row.numberOfUnqualifiedLeads = (row.numberOfUnqualifiedLeads || 0) + 1;
    }

    // Count estimate canceled
    if (lead.status === 'estimate_canceled') {
      row.numberOfEstimateCanceled = (row.numberOfEstimateCanceled || 0) + 1;
    }

    // Count job lost
    if (lead.status === 'job_lost') {
      row.numberOfJobLost = (row.numberOfJobLost || 0) + 1;
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
    const unqualifiedLeads = row.numberOfUnqualifiedLeads || 0;
    const virtualQuotes = row.numberOfVirtualQuotes || 0;
    const estimateCanceled = row.numberOfEstimateCanceled || 0;
    const proposalPresented = row.numberOfProposalPresented || 0;
    const jobLost = row.numberOfJobLost || 0;
    const count = row._count || 1;  // Number of weekly records aggregated

    // Basic metrics (directly from DB)
    row.fb_spend = Number(totalSpend.toFixed(2));
    row.fb_impressions = totalImpressions;
    row.fb_clicks = totalClicks;
    row.fb_unique_clicks = row._totalUniqueClicks || 0;
    row.fb_reach = totalReach;
    
    // Calculate metrics from aggregated totals (not pre-calculated averages)
    row.fb_frequency = totalReach > 0 ? Number((totalImpressions / totalReach).toFixed(2)) : 0;
    row.fb_ctr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    row.fb_unique_ctr = totalImpressions > 0 ? Number((((row._totalUniqueClicks || 0) / totalImpressions) * 100).toFixed(2)) : 0;
    row.fb_cpc = totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0;
    row.fb_cpm = totalImpressions > 0 ? Number(((totalSpend / totalImpressions) * 1000).toFixed(2)) : 0;
    row.fb_cpr = totalReach > 0 ? Number(((totalSpend / totalReach) * 1000).toFixed(2)) : 0;
    
    // Engagement metrics (from DB)
    row.fb_post_engagements = row._totalPostEngagements || 0;
    row.fb_post_reactions = row._totalPostReactions || 0;
    row.fb_post_comments = row._totalPostComments || 0;
    row.fb_post_shares = row._totalPostShares || 0;
    row.fb_post_saves = row._totalPostSaves || 0;
    row.fb_page_engagements = row._totalPageEngagements || 0;
    row.fb_link_clicks = row._totalLinkClicks || 0;
    
    // Video metrics (from DB)
    row.fb_video_views = row._totalVideoViews || 0;
    row.fb_video_views_25pct = row._totalVideoViews25 || 0;
    row.fb_video_views_50pct = row._totalVideoViews50 || 0;
    row.fb_video_views_75pct = row._totalVideoViews75 || 0;
    row.fb_video_views_100pct = row._totalVideoViews100 || 0;
    row.fb_video_avg_watch_time = row._totalVideoAvgWatchTime || 0;
    row.fb_video_play_actions = row._totalVideoPlayActions || 0;
    
    // Conversion metrics (from DB)
    row.fb_total_conversions = row._totalConversions || 0;
    row.fb_conversion_value = row._totalConversionValue || 0;
    row.fb_cost_per_conversion = row.fb_total_conversions > 0 ? Number((totalSpend / row.fb_total_conversions).toFixed(2)) : 0;
    row.fb_total_leads = row._totalLeads || 0;
    
    row.fb_cost_per_lead = row.fb_total_leads > 0
      ? Number((totalSpend / row.fb_total_leads).toFixed(2))
      : 0;
    
    // Lead cost metrics (calculate only lead-related costs, based on CRM leads)
    row.costPerLead = totalLeads > 0 ? Number((totalSpend / totalLeads).toFixed(2)) : null;
    row.costPerEstimateSet = estimateSets > 0 ? Number((totalSpend / estimateSets).toFixed(2)) : null;
    row.costPerJobBooked = jobsBooked > 0 ? Number((totalSpend / jobsBooked).toFixed(2)) : null;
    row.costOfMarketingPercent = totalRevenue > 0 ? Number(((totalSpend / totalRevenue) * 100).toFixed(2)) : null;
    
    // Additional metrics - estimateSetRate calculation
    // netEstimates = estimateSets + virtualQuotes + proposalPresented + jobBooked
    // netUnqualifieds = unqualified + estimateCanceled + jobLost
    // estimateSetRate = netEstimates / (netEstimates + netUnqualifieds) * 100
    const netEstimates = estimateSets + virtualQuotes + proposalPresented + jobsBooked;
    const netUnqualifieds = unqualifiedLeads + estimateCanceled + jobLost;
    const totalDecisionLeads = netEstimates + netUnqualifieds;
    row.estimateSetRate = totalDecisionLeads > 0 ? Number(((netEstimates / totalDecisionLeads) * 100).toFixed(2)) : null;
    row.revenue = Number(totalRevenue.toFixed(2));
    
    // Convert service and zipCode sets to comma-separated strings
    row.service = row._services && row._services.size > 0 ? Array.from(row._services).sort().join(', ') : undefined;
    row.zipCode = row._zipCodes && row._zipCodes.size > 0 ? Array.from(row._zipCodes).sort().join(', ') : undefined;
  });

  // Step 9: Filter columns based on requested fields
  const results: BoardRow[] = [];

  aggregationMap.forEach((row) => {
    const filteredRow: BoardRow = {};

    // Dimension columns
    if (columns.campaignName) filteredRow.campaignName = row.campaignName;
    if (columns.adSetName) filteredRow.adSetName = row.adSetName;
    if (columns.adName) filteredRow.adName = row.adName;
    if (columns.service) filteredRow.service = row.service;
    if (columns.zipCode) filteredRow.zipCode = row.zipCode;
    
    // Always include creative data when available (for ad-level grouping)
    if ((row as any).creative) {
      (filteredRow as any).creative = (row as any).creative;
    }
    
    // Basic metrics
    if (columns.fb_spend) filteredRow.fb_spend = row.fb_spend;
    if (columns.fb_impressions) filteredRow.fb_impressions = row.fb_impressions;
    if (columns.fb_clicks) filteredRow.fb_clicks = row.fb_clicks;
    if (columns.fb_unique_clicks) filteredRow.fb_unique_clicks = row.fb_unique_clicks;
    if (columns.fb_reach) filteredRow.fb_reach = row.fb_reach;
    if (columns.fb_frequency) filteredRow.fb_frequency = row.fb_frequency;
    
    // CTR metrics
    if (columns.fb_ctr) filteredRow.fb_ctr = row.fb_ctr;
    if (columns.fb_unique_ctr) filteredRow.fb_unique_ctr = row.fb_unique_ctr;
    
    // Cost metrics
    if (columns.fb_cpc) filteredRow.fb_cpc = row.fb_cpc;
    if (columns.fb_cpm) filteredRow.fb_cpm = row.fb_cpm;
    if (columns.fb_cpr) filteredRow.fb_cpr = row.fb_cpr;
    
    // Engagement metrics
    if (columns.fb_post_engagements) filteredRow.fb_post_engagements = row.fb_post_engagements;
    if (columns.fb_post_reactions) filteredRow.fb_post_reactions = row.fb_post_reactions;
    if (columns.fb_post_comments) filteredRow.fb_post_comments = row.fb_post_comments;
    if (columns.fb_post_shares) filteredRow.fb_post_shares = row.fb_post_shares;
    if (columns.fb_post_saves) filteredRow.fb_post_saves = row.fb_post_saves;
    if (columns.fb_page_engagements) filteredRow.fb_page_engagements = row.fb_page_engagements;
    if (columns.fb_link_clicks) filteredRow.fb_link_clicks = row.fb_link_clicks;
    
    // Video metrics
    if (columns.fb_video_views) filteredRow.fb_video_views = row.fb_video_views;
    if (columns.fb_video_views_25pct) filteredRow.fb_video_views_25pct = row.fb_video_views_25pct;
    if (columns.fb_video_views_50pct) filteredRow.fb_video_views_50pct = row.fb_video_views_50pct;
    if (columns.fb_video_views_75pct) filteredRow.fb_video_views_75pct = row.fb_video_views_75pct;
    if (columns.fb_video_views_100pct) filteredRow.fb_video_views_100pct = row.fb_video_views_100pct;
    if (columns.fb_video_avg_watch_time) filteredRow.fb_video_avg_watch_time = row.fb_video_avg_watch_time;
    if (columns.fb_video_play_actions) filteredRow.fb_video_play_actions = row.fb_video_play_actions;
    
    // Conversion metrics
    if (columns.fb_total_conversions) filteredRow.fb_total_conversions = row.fb_total_conversions;
    if (columns.fb_conversion_value) filteredRow.fb_conversion_value = row.fb_conversion_value;
    if (columns.fb_cost_per_conversion) filteredRow.fb_cost_per_conversion = row.fb_cost_per_conversion;
    if (columns.fb_total_leads) filteredRow.fb_total_leads = row.fb_total_leads;
    if (columns.fb_cost_per_lead) filteredRow.fb_cost_per_lead = row.fb_cost_per_lead;
    
    // Lead metrics
    if (columns.numberOfLeads) filteredRow.numberOfLeads = row.numberOfLeads;
    if (columns.numberOfEstimateSets) filteredRow.numberOfEstimateSets = row.numberOfEstimateSets;
    if (columns.numberOfJobsBooked) filteredRow.numberOfJobsBooked = row.numberOfJobsBooked;
    if (columns.numberOfUnqualifiedLeads) filteredRow.numberOfUnqualifiedLeads = row.numberOfUnqualifiedLeads;
    
    // Lead cost metrics
    if (columns.costPerLead) filteredRow.costPerLead = row.costPerLead;
    if (columns.costPerEstimateSet) filteredRow.costPerEstimateSet = row.costPerEstimateSet;
    if (columns.costPerJobBooked) filteredRow.costPerJobBooked = row.costPerJobBooked;
    if (columns.costOfMarketingPercent) filteredRow.costOfMarketingPercent = row.costOfMarketingPercent;
    
    // Additional metrics
    if (columns.estimateSetRate) filteredRow.estimateSetRate = row.estimateSetRate;
    if (columns.revenue) filteredRow.revenue = row.revenue;

    // Store internal fields for sorting
    (filteredRow as any)._totalSpend = row._totalSpend;

    results.push(filteredRow);
  });

  // Sort by spend descending (most expensive first)
  results.sort((a, b) => {
    const spendA = (a as any)._totalSpend || 0;
    const spendB = (b as any)._totalSpend || 0;
    return spendB - spendA;
  });

  // Remove internal fields before returning
  results.forEach((row) => {
    delete (row as any)._totalSpend;
  });

  // Calculate overall averages from all rows in aggregationMap
  let totalRows = 0;
  let sumSpend = 0;
  let sumImpressions = 0;
  let sumClicks = 0;
  let sumUniqueClicks = 0;
  let sumReach = 0;
  let sumTotalConversions = 0;
  let sumTotalLeads = 0;
  let sumNumberOfLeads = 0;
  let sumEstimateSets = 0;
  let sumJobsBooked = 0;
  let sumUnqualifiedLeads = 0;
  let sumVirtualQuotes = 0;
  let sumEstimateCanceled = 0;
  let sumProposalPresented = 0;
  let sumJobLost = 0;
  let sumRevenue = 0;

  aggregationMap.forEach((row) => {
    totalRows++;
    sumSpend += row._totalSpend || 0;
    sumImpressions += row._totalImpressions || 0;
    sumClicks += row._totalClicks || 0;
    sumUniqueClicks += row._totalUniqueClicks || 0;
    sumReach += row._totalReach || 0;
    sumTotalConversions += row._totalConversions || 0;
    sumTotalLeads += row._totalLeads || 0;
    sumNumberOfLeads += row.numberOfLeads || 0;
    sumEstimateSets += row.numberOfEstimateSets || 0;
    sumJobsBooked += row.numberOfJobsBooked || 0;
    sumUnqualifiedLeads += row.numberOfUnqualifiedLeads || 0;
    sumVirtualQuotes += row.numberOfVirtualQuotes || 0;
    sumEstimateCanceled += row.numberOfEstimateCanceled || 0;
    sumProposalPresented += row.numberOfProposalPresented || 0;
    sumJobLost += row.numberOfJobLost || 0;
    sumRevenue += row._totalRevenue || 0;
  });

  // Only include calculated averages (ratios/percentages), not sums
  const averages = {
    fb_frequency: sumReach > 0 ? Number((sumImpressions / sumReach).toFixed(2)) : 0,
    fb_ctr: sumImpressions > 0 ? Number(((sumClicks / sumImpressions) * 100).toFixed(2)) : 0,
    fb_unique_ctr: sumImpressions > 0 ? Number(((sumUniqueClicks / sumImpressions) * 100).toFixed(2)) : 0,
    fb_cpc: sumClicks > 0 ? Number((sumSpend / sumClicks).toFixed(2)) : 0,
    fb_cpm: sumImpressions > 0 ? Number(((sumSpend / sumImpressions) * 1000).toFixed(2)) : 0,
    fb_cpr: sumReach > 0 ? Number(((sumSpend / sumReach) * 1000).toFixed(2)) : 0,
    fb_cost_per_conversion: sumTotalConversions > 0 ? Number((sumSpend / sumTotalConversions).toFixed(2)) : 0,
    fb_cost_per_lead: sumTotalLeads > 0 ? Number((sumSpend / sumTotalLeads).toFixed(2)) : 0,
    costPerLead: sumNumberOfLeads > 0 ? Number((sumSpend / sumNumberOfLeads).toFixed(2)) : null,
    costPerEstimateSet: sumEstimateSets > 0 ? Number((sumSpend / sumEstimateSets).toFixed(2)) : null,
    costPerJobBooked: sumJobsBooked > 0 ? Number((sumSpend / sumJobsBooked).toFixed(2)) : null,
    costOfMarketingPercent: sumRevenue > 0 ? Number(((sumSpend / sumRevenue) * 100).toFixed(2)) : null,
    estimateSetRate: (() => {
      const totalNetEstimates = sumEstimateSets + sumVirtualQuotes + sumProposalPresented + sumJobsBooked;
      const totalNetUnqualifieds = sumUnqualifiedLeads + sumEstimateCanceled + sumJobLost;
      const totalDecisions = totalNetEstimates + totalNetUnqualifieds;
      return totalDecisions > 0 ? Number(((totalNetEstimates / totalDecisions) * 100).toFixed(2)) : null;
    })(),
  };

  return {
    rows: results,
    averages,
    availableZipCodes,
    availableServiceTypes
  };
}
