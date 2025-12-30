// enrichedAdsService.ts
import { getAdInsights } from './fbInsightsService.js';
import { getAdsWithCreatives, mapAdWithCreative } from './fbAdsService.js';
import { getLeadForms } from './fbLeadFormsService.js';
import { DateUtils } from '../../utils/date.utils.js';
import { EnrichedAd, WeeklyMetaSpend } from './domain/facebookAds.domain.js';

export async function getEnrichedAds({ 
  adAccountId, 
  startDate, 
  endDate, 
  queryType,
  accessToken
}: { 
  adAccountId: string; 
  startDate: string; 
  endDate: string; 
  queryType: 'weekly' | 'monthly' | 'yearly';
  accessToken: string;
}): Promise<EnrichedAd[] | WeeklyMetaSpend[]> {
  console.log(`\n[Enriched Ads] Starting enrichment process for ${adAccountId} from ${startDate} to ${endDate} (${queryType})`);
  
  let _startDate = startDate;
  let _endDate = endDate;

  if (!accessToken) {
    throw new Error('Meta access token is required');
  }
  
  if (queryType === 'monthly' || queryType === 'yearly') {
    const adjustedStartDate = DateUtils.adjustStartDateForWeekBoundary(startDate, queryType);
    const adjustedEndDate = DateUtils.adjustEndDateForWeekBoundary(endDate, queryType);
    _startDate = adjustedStartDate;
    _endDate = adjustedEndDate;
    // return await getWeeklyMetaSpend(adAccountId, adjustedStartDate, adjustedEndDate, queryType, accessToken);
  }

  const insightsRows = await getAdInsights({ adAccountId, since: _startDate, until: _endDate, accessToken });
  if (!insightsRows.length) {
    return [];
  }

  const uniqueAdIds = Array.from(
    new Set(insightsRows.map(row => row.ad_id))
  );

  const adsMapRaw = await getAdsWithCreatives(uniqueAdIds, accessToken);
  const adEnrichedMap: Record<string, any> = {};
  const formIdsSet = new Set<string>();

  for (const adId of uniqueAdIds) {
    const adObj = adsMapRaw[adId];
    if (!adObj) continue;

    const normalized = mapAdWithCreative(adObj);
    adEnrichedMap[adId] = normalized;

    if (normalized.lead_gen_form_id) {
      formIdsSet.add(normalized.lead_gen_form_id);
    }
  }

  const formMap = await getLeadForms(Array.from(formIdsSet), accessToken);

  // 4) Join into final structure per insight row
  const final: EnrichedAd[] = insightsRows.map(row => {
    const enriched = adEnrichedMap[row.ad_id] || {};
    const creative = enriched.creative || null;
    const formId = enriched.lead_gen_form_id || null;
    const form = formId ? formMap[formId] || null : null;
    const adConfigs = {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      ad_id: row.ad_id,
      ad_name: row.ad_name,
    }

    // Helper to extract action values from actions array
    const getActionValue = (actionType: string): number => {
      if (!row.actions) return 0;
      const action = row.actions.find(a => a.action_type === actionType);
      return Number(action?.value || 0);
    };

    // Helper to extract action value from action_values array
    const getActionValueAmount = (actionType: string): number => {
      if (!row.action_values) return 0;
      const actionValue = row.action_values.find(a => a.action_type === actionType);
      return Number(actionValue?.value || 0);
    };

    // Helper to extract cost per action
    const getCostPerAction = (actionType: string): number => {
      if (!row.cost_per_action_type) return 0;
      const costAction = row.cost_per_action_type.find(a => a.action_type === actionType);
      return Number(costAction?.value || 0);
    };

    // Helper to extract video metric values
    const getVideoMetric = (metric?: Array<{ action_type: string; value: string }>): number => {
      if (!metric || !metric.length) return 0;
      return Number(metric[0].value || 0);
    };

    // Extract engagement metrics from actions array
    const post_engagement = getActionValue('post_engagement') || getActionValue('post');
    const post_reactions = getActionValue('post_reaction') || getActionValue('like');
    const post_saves = getActionValue('post_save') || getActionValue('offsite_conversion.fb_pixel_custom');
    const post_shares = getActionValue('post_share') || getActionValue('share');
    const page_engagement = getActionValue('page_engagement');
    const link_clicks = Number(row.inline_link_clicks || 0) || getActionValue('link_click');
    
    // Calculate leads from actions
    const leads = getActionValue('lead') || getActionValue('leadgen.other') || getActionValue('onsite_conversion.lead_grouped');
    
    // Calculate cost per lead
    const spend = Number(row.spend || 0);
    const cost_per_lead = leads > 0 ? spend / leads : 0;

    // Extract conversion metrics
    const conversions = getActionValue('offsite_conversion') || getActionValue('omni_purchase');
    const conversion_values = getActionValueAmount('offsite_conversion') || getActionValueAmount('omni_purchase');
    const cost_per_conversion = conversions > 0 ? spend / conversions : getCostPerAction('offsite_conversion');

    // Helper to extract array-based metrics (ROAS, website_ctr, etc.)
    const getArrayMetric = (metric?: Array<{ action_type: string; value: string }>): number => {
      if (!metric || !metric.length) return 0;
      return Number(metric[0].value || 0);
    };

    return {
      ...adConfigs,
      creative: creative,
      lead_form: form
        ? { id: form.id, name: form.name }
        : null,
      insights: {
        // Campaign Settings
        objective: row.objective,
        optimization_goal: row.optimization_goal,
        buying_type: row.buying_type,
        attribution_setting: row.attribution_setting,
        account_currency: row.account_currency,
        
        // Basic Metrics
        impressions: Number(row.impressions || 0),
        reach: Number(row.reach || 0),
        frequency: Number(row.frequency || 0),
        clicks: Number(row.clicks || 0),
        unique_clicks: Number(row.unique_clicks || 0),
        ctr: Number(row.ctr || 0),
        unique_ctr: Number(row.unique_ctr || 0),
        cpc: Number(row.cpc || 0),
        cpm: Number(row.cpm || 0),
        cpp: Number(row.cpp || 0),
        
        // Spend
        spend: spend,
        social_spend: Number(row.social_spend || 0),
        
        // Link Clicks & CTR (Extended)
        inline_link_clicks: Number(row.inline_link_clicks || 0),
        outbound_clicks: Number(row.outbound_clicks || 0),
        unique_outbound_clicks: Number(row.unique_outbound_clicks || 0),
        inline_link_click_ctr: Number(row.inline_link_click_ctr || 0),
        unique_inline_link_click_ctr: Number(row.unique_inline_link_click_ctr || 0),
        cost_per_inline_link_click: Number(row.cost_per_inline_link_click || 0),
        cost_per_unique_inline_link_click: Number(row.cost_per_unique_inline_link_click || 0),
        unique_link_clicks_ctr: Number(row.unique_link_clicks_ctr || 0),
        outbound_clicks_ctr: Number(row.outbound_clicks_ctr || 0),
        unique_outbound_clicks_ctr: Number(row.unique_outbound_clicks_ctr || 0),
        cost_per_outbound_click: Number(row.cost_per_outbound_click || 0),
        cost_per_unique_outbound_click: Number(row.cost_per_unique_outbound_click || 0),
        
        // Engagement Metrics
        inline_post_engagement: Number(row.inline_post_engagement || 0),
        cost_per_inline_post_engagement: Number(row.cost_per_inline_post_engagement || 0),
        post_engagement: post_engagement,
        post_reactions: post_reactions,
        post_comments: getActionValue('comment'),
        post_saves: post_saves,
        post_shares: post_shares,
        page_engagement: page_engagement,
        link_clicks: link_clicks,
        
        // Quality & Delivery Rankings
        quality_ranking: row.quality_ranking,
        engagement_rate_ranking: row.engagement_rate_ranking,
        conversion_rate_ranking: row.conversion_rate_ranking,
        delivery: undefined, // Not available as direct field
        
        // Video Metrics (Complete)
        video_views: getActionValue('video_view'),
        video_views_p25: getVideoMetric(row.video_p25_watched_actions),
        video_views_p50: getVideoMetric(row.video_p50_watched_actions),
        video_views_p75: getVideoMetric(row.video_p75_watched_actions),
        video_views_p100: getVideoMetric(row.video_p100_watched_actions),
        video_avg_time_watched: getVideoMetric(row.video_avg_time_watched_actions),
        video_play_actions: getVideoMetric(row.video_play_actions),
        video_continuous_2_sec_watched: getVideoMetric(row.video_continuous_2_sec_watched_actions),
        video_thruplay_watched: getVideoMetric(row.video_thruplay_watched_actions),
        cost_per_thruplay: getArrayMetric(row.cost_per_thruplay),
        cost_per_2_sec_continuous_video_view: getArrayMetric(row.cost_per_2_sec_continuous_video_view),
        
        // Conversion Metrics (Extended)
        conversions: conversions,
        conversion_values: conversion_values,
        cost_per_conversion: cost_per_conversion,
        converted_product_quantity: getArrayMetric(row.converted_product_quantity),
        converted_product_value: getArrayMetric(row.converted_product_value),
        
        // Landing Page & Website
        landing_page_views: getActionValue('landing_page_view'),
        cost_per_landing_page_view: getCostPerAction('landing_page_view'),
        website_ctr: getArrayMetric(row.website_ctr),
        offsite_conversions: getArrayMetric(row.offsite_conversion),
        
        // Mobile App
        mobile_app_purchase_roas: getArrayMetric(row.mobile_app_purchase_roas),
        website_purchase_roas: getArrayMetric(row.website_purchase_roas),
        purchase_roas: getArrayMetric(row.purchase_roas),
        app_store_clicks: getActionValue('app_custom_event.fb_mobile_activate_app'),
        deeplink_clicks: getActionValue('app_custom_event.fb_mobile_link_click'),
        
        // Instant Experience (Canvas)
        canvas_avg_view_percent: Number(row.canvas_avg_view_percent || 0),
        canvas_avg_view_time: Number(row.canvas_avg_view_time || 0),
        instant_experience_clicks_to_open: Number(row.instant_experience_clicks_to_open || 0),
        instant_experience_clicks_to_start: Number(row.instant_experience_clicks_to_start || 0),
        instant_experience_outbound_clicks: Number(row.instant_experience_outbound_clicks || 0),
        
        // Catalog & Dynamic Ads
        catalog_segment_actions: getArrayMetric(row.catalog_segment_actions),
        catalog_segment_value: getArrayMetric(row.catalog_segment_value),
        catalog_segment_value_mobile_purchase_roas: getArrayMetric(row.catalog_segment_value_mobile_purchase_roas),
        catalog_segment_value_website_purchase_roas: getArrayMetric(row.catalog_segment_value_website_purchase_roas),
        
        // Brand Awareness
        estimated_ad_recall_rate: Number(row.estimated_ad_recall_rate || 0),
        estimated_ad_recallers: Number(row.estimated_ad_recallers || 0),
        cost_per_estimated_ad_recaller: Number(row.cost_per_estimated_ad_recallers || 0),
        
        // Store Traffic
        store_visit_actions: getActionValue('offline_conversion.store_visit'),
        cost_per_store_visit_action: getCostPerAction('offline_conversion.store_visit'),
        
        // Full Funnel Metrics
        full_view_impressions: Number(row.full_view_impressions || 0),
        full_view_reach: Number(row.full_view_reach || 0),
        
        // E-commerce Actions (from actions array)
        purchases: getActionValue('purchase') || getActionValue('omni_purchase'),
        add_to_cart: getActionValue('add_to_cart') || getActionValue('omni_add_to_cart'),
        initiate_checkout: getActionValue('initiate_checkout'),
        view_content: getActionValue('view_content'),
        search: getActionValue('search'),
        add_payment_info: getActionValue('add_payment_info'),
        complete_registration: getActionValue('complete_registration'),
        contact: getActionValue('contact'),
        customize_product: getActionValue('customize_product'),
        donate: getActionValue('donate'),
        find_location: getActionValue('find_location'),
        schedule: getActionValue('schedule'),
        start_trial: getActionValue('start_trial'),
        submit_application: getActionValue('submit_application'),
        subscribe: getActionValue('subscribe'),
        
        // Lead Metrics
        leads: leads,
        cost_per_lead: cost_per_lead,
        
        // Date Range
        date_start: row.date_start,
        date_stop: row.date_stop,
      },
    };
  });

  return final;
}

/**
 * Get weekly aggregated Meta ad spend data (matching WeeklyActual pattern)
 * Returns array of weekly spend objects with startDate/endDate boundaries
 */
async function getWeeklyMetaSpend(
  adAccountId: string,
  startDate: string,
  endDate: string,
  queryType: 'monthly' | 'yearly',
  accessToken: string
): Promise<WeeklyMetaSpend[]> {
  console.log(`[Weekly Meta Spend] Calculating weeks for ${queryType} query: ${startDate} to ${endDate}`);
  
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }
  
  // Get week boundaries using same logic as actuals
  const weeks = DateUtils.getMonthWeeks(startDate, endDate);
  console.log(`[Weekly Meta Spend] Found ${weeks.length} weeks`);

  // Fetch insights for each week and aggregate
  const weeklyResults = await Promise.all(
    weeks.map(async ({ weekStart, weekEnd }) => {
      console.log(`[Weekly Meta Spend] Fetching data for week: ${weekStart} to ${weekEnd}`);
      
      try {
        const insightsRows = await getAdInsights({ 
          adAccountId, 
          since: weekStart, 
          until: weekEnd,
          accessToken
        });

        // Aggregate spend, impressions, clicks for the week
        const weekTotal = insightsRows.reduce((acc, row) => ({
          spend: acc.spend + Number(row.spend || 0),
          impressions: acc.impressions + Number(row.impressions || 0),
          clicks: acc.clicks + Number(row.clicks || 0),
        }), { spend: 0, impressions: 0, clicks: 0 });

        return {
          startDate: weekStart,
          endDate: weekEnd,
          adAccountId,
          ...weekTotal
        };
      } catch (error) {
        console.error(`[Weekly Meta Spend] Error fetching week ${weekStart}:`, error);
        // Return zero-filled data for failed weeks
        return {
          startDate: weekStart,
          endDate: weekEnd,
          adAccountId,
          spend: 0,
          impressions: 0,
          clicks: 0,
        };
      }
    })
  );

  console.log(`[Weekly Meta Spend] Returning ${weeklyResults.length} weekly records\n`);
  return weeklyResults;
}
