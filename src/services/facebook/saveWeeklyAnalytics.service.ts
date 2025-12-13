import { getEnrichedAds } from './enrichedAdsService.js';
import { fbWeeklyAnalyticsRepository } from './repository/FbWeeklyAnalyticsRepository.js';
import { DateUtils } from '../../utils/date.utils.js';
import { EnrichedAd, SaveWeeklyAnalyticsParams, SaveResult } from './domain/facebookAds.domain.js';

/**
 * Fetch enriched ads data from Facebook and save it in weekly chunks
 * Always splits data into weekly periods regardless of input date range
 */
export async function saveWeeklyAnalyticsToDb({
  clientId,
  adAccountId,
  startDate,
  endDate,
  accessToken
}: SaveWeeklyAnalyticsParams): Promise<SaveResult> {
  console.log(`\n[Save Weekly Analytics]  Starting save process`);
  console.log(`[Save Weekly Analytics] Client: ${clientId}`);
  console.log(`[Save Weekly Analytics] Ad Account: ${adAccountId}`);
  console.log(`[Save Weekly Analytics] Date Range: ${startDate} to ${endDate}`);

  try {
    // Step 1: Split date range into weekly chunks
    const weekPeriods = DateUtils.getMonthWeeks(startDate, endDate);
    console.log(`[Save Weekly Analytics]  Split into ${weekPeriods.length} weekly periods`);

    let totalSaved = 0;
    const allErrors: any[] = [];

    // Step 2: Fetch and save data for each week
    for (let i = 0; i < weekPeriods.length; i++) {
      const { weekStart, weekEnd } = weekPeriods[i];
      
      console.log(`\n[Save Weekly Analytics]  Processing week ${i + 1}/${weekPeriods.length}: ${weekStart} to ${weekEnd}`);

      try {
        // Fetch data for this specific week
        const enrichedAdsData = await getEnrichedAds({
          adAccountId,
          startDate: weekStart,
          endDate: weekEnd,
          queryType: 'weekly',
          accessToken
        });

        if (!Array.isArray(enrichedAdsData) || enrichedAdsData.length === 0) {
          console.log(`[Save Weekly Analytics]   No data for week ${weekStart} to ${weekEnd}`);
          continue;
        }

        const firstItem = enrichedAdsData[0];
        if (!('campaign_name' in firstItem)) {
          console.warn(`[Save Weekly Analytics]   Unexpected data format for week ${weekStart}`);
          continue;
        }

        const ads = enrichedAdsData as EnrichedAd[];
        console.log(`[Save Weekly Analytics] ✓ Found ${ads.length} ads for this week`);

        // Transform to database format with readable field names
        const weeklyAnalytics = ads.map(ad => ({
          // Client & Account
          clientId,
          facebookAdAccountId: adAccountId,
          
          // Campaign Hierarchy (Readable Names)
          campaignId: ad.campaign_id,
          campaignName: ad.campaign_name,
          adSetId: ad.adset_id,
          adSetName: ad.adset_name,
          adId: ad.ad_id,
          adName: ad.ad_name,
          
          // Campaign Settings
          objective: ad.insights?.objective,
          optimizationGoal: ad.insights?.optimization_goal,
          buyingType: ad.insights?.buying_type,
          attributionSetting: ad.insights?.attribution_setting,
          accountCurrency: ad.insights?.account_currency,
          
          // Creative
          creative: ad.creative ? {
            raw: null,
            id: ad.creative.id,
            name: ad.creative.name,
            primaryText: ad.creative.primary_text,
            headline: ad.creative.headline,
            rawData: ad.creative.raw
          } : null,
          
          // Lead Form
          leadForm: ad.lead_form ? {
            id: ad.lead_form.id,
            name: ad.lead_form.name
          } : null,
          
          // Performance Metrics (Readable Names)
          metrics: {
            // Basic Performance
            impressions: ad.insights.impressions ?? 0,
            reach: ad.insights.reach ?? 0,
            frequency: ad.insights.frequency ?? 0,
            clicks: ad.insights.clicks ?? 0,
            unique_clicks: ad.insights.unique_clicks ?? 0,
            ctr: ad.insights.ctr ?? 0,
            unique_ctr: ad.insights.unique_ctr ?? 0,
            
            // Costs
            spend: ad.insights.spend ?? 0,
            social_spend: ad.insights.social_spend ?? 0,
            cpc: ad.insights.cpc ?? 0,
            cpm: ad.insights.cpm ?? 0,
            cpr: ad.insights.cpp ?? 0,
            
            // Link Clicks & CTR (Extended)
            inline_link_clicks: ad.insights.inline_link_clicks ?? 0,
            outbound_clicks: ad.insights.outbound_clicks ?? 0,
            unique_outbound_clicks: ad.insights.unique_outbound_clicks ?? 0,
            inline_link_click_ctr: ad.insights.inline_link_click_ctr ?? 0,
            unique_inline_link_click_ctr: ad.insights.unique_inline_link_click_ctr ?? 0,
            cost_per_inline_link_click: ad.insights.cost_per_inline_link_click ?? 0,
            cost_per_unique_inline_link_click: ad.insights.cost_per_unique_inline_link_click ?? 0,
            unique_link_clicks_ctr: ad.insights.unique_link_clicks_ctr ?? 0,
            outbound_clicks_ctr: ad.insights.outbound_clicks_ctr ?? 0,
            unique_outbound_clicks_ctr: ad.insights.unique_outbound_clicks_ctr ?? 0,
            cost_per_outbound_click: ad.insights.cost_per_outbound_click ?? 0,
            cost_per_unique_outbound_click: ad.insights.cost_per_unique_outbound_click ?? 0,
            
            // Engagement (Complete)
            inline_post_engagement: ad.insights.inline_post_engagement ?? 0,
            cost_per_inline_post_engagement: ad.insights.cost_per_inline_post_engagement ?? 0,
            post_engagements: ad.insights.post_engagement ?? 0,
            post_reactions: ad.insights.post_reactions ?? 0,
            post_comments: ad.insights.post_comments ?? 0,
            post_saves: ad.insights.post_saves ?? 0,
            post_shares: ad.insights.post_shares ?? 0,
            page_engagements: ad.insights.page_engagement ?? 0,
            link_clicks: ad.insights.link_clicks ?? 0,
            
            // Quality & Delivery Rankings
            quality_ranking: ad.insights.quality_ranking,
            engagement_rate_ranking: ad.insights.engagement_rate_ranking,
            conversion_rate_ranking: ad.insights.conversion_rate_ranking,
            delivery: ad.insights.delivery,
            
            // Video Performance (Complete)
            video_views: ad.insights.video_views ?? 0,
            video_views_25pct: ad.insights.video_views_p25 ?? 0,
            video_views_50pct: ad.insights.video_views_p50 ?? 0,
            video_views_75pct: ad.insights.video_views_p75 ?? 0,
            video_views_100pct: ad.insights.video_views_p100 ?? 0,
            video_avg_watch_time: ad.insights.video_avg_time_watched ?? 0,
            video_play_actions: ad.insights.video_play_actions ?? 0,
            video_continuous_2_sec_watched: ad.insights.video_continuous_2_sec_watched ?? 0,
            video_thruplay_watched: ad.insights.video_thruplay_watched ?? 0,
            cost_per_thruplay: ad.insights.cost_per_thruplay ?? 0,
            cost_per_2_sec_continuous_video_view: ad.insights.cost_per_2_sec_continuous_video_view ?? 0,
            
            // Conversions (Extended)
            total_conversions: ad.insights.conversions ?? 0,
            conversion_value: ad.insights.conversion_values ?? 0,
            cost_per_conversion: ad.insights.cost_per_conversion ?? 0,
            converted_product_quantity: ad.insights.converted_product_quantity ?? 0,
            converted_product_value: ad.insights.converted_product_value ?? 0,
            
            // Landing Page & Website
            landing_page_views: ad.insights.landing_page_views ?? 0,
            cost_per_landing_page_view: ad.insights.cost_per_landing_page_view ?? 0,
            website_ctr: ad.insights.website_ctr ?? 0,
            offsite_conversions: ad.insights.offsite_conversions ?? 0,
            
            // Mobile App
            mobile_app_purchase_roas: ad.insights.mobile_app_purchase_roas ?? 0,
            website_purchase_roas: ad.insights.website_purchase_roas ?? 0,
            purchase_roas: ad.insights.purchase_roas ?? 0,
            app_store_clicks: ad.insights.app_store_clicks ?? 0,
            deeplink_clicks: ad.insights.deeplink_clicks ?? 0,
            
            // Instant Experience (Canvas)
            canvas_avg_view_percent: ad.insights.canvas_avg_view_percent ?? 0,
            canvas_avg_view_time: ad.insights.canvas_avg_view_time ?? 0,
            instant_experience_clicks_to_open: ad.insights.instant_experience_clicks_to_open ?? 0,
            instant_experience_clicks_to_start: ad.insights.instant_experience_clicks_to_start ?? 0,
            instant_experience_outbound_clicks: ad.insights.instant_experience_outbound_clicks ?? 0,
            
            // Catalog & Dynamic Ads
            catalog_segment_actions: ad.insights.catalog_segment_actions ?? 0,
            catalog_segment_value: ad.insights.catalog_segment_value ?? 0,
            catalog_segment_value_mobile_purchase_roas: ad.insights.catalog_segment_value_mobile_purchase_roas ?? 0,
            catalog_segment_value_website_purchase_roas: ad.insights.catalog_segment_value_website_purchase_roas ?? 0,
            
            // Brand Awareness
            estimated_ad_recall_rate: ad.insights.estimated_ad_recall_rate ?? 0,
            estimated_ad_recallers: ad.insights.estimated_ad_recallers ?? 0,
            cost_per_estimated_ad_recaller: ad.insights.cost_per_estimated_ad_recaller ?? 0,
            
            // Store Traffic
            store_visit_actions: ad.insights.store_visit_actions ?? 0,
            cost_per_store_visit_action: ad.insights.cost_per_store_visit_action ?? 0,
            
            // Full Funnel Metrics
            full_view_impressions: ad.insights.full_view_impressions ?? 0,
            full_view_reach: ad.insights.full_view_reach ?? 0,
            
            // E-commerce Actions (from actions array)
            purchases: ad.insights.purchases ?? 0,
            add_to_cart: ad.insights.add_to_cart ?? 0,
            initiate_checkout: ad.insights.initiate_checkout ?? 0,
            view_content: ad.insights.view_content ?? 0,
            search: ad.insights.search ?? 0,
            add_payment_info: ad.insights.add_payment_info ?? 0,
            complete_registration: ad.insights.complete_registration ?? 0,
            contact: ad.insights.contact ?? 0,
            customize_product: ad.insights.customize_product ?? 0,
            donate: ad.insights.donate ?? 0,
            find_location: ad.insights.find_location ?? 0,
            schedule: ad.insights.schedule ?? 0,
            start_trial: ad.insights.start_trial ?? 0,
            submit_application: ad.insights.submit_application ?? 0,
            subscribe: ad.insights.subscribe ?? 0,
            
            // Leads
            total_leads: ad.insights.leads ?? 0,
            cost_per_lead: ad.insights.cost_per_lead ?? 0
          },
          
          // Week Period
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          
          // Metadata
          dataSource: 'facebook_api' as const
        }));

        // Bulk save to database
        const result = await fbWeeklyAnalyticsRepository.bulkSaveWeeklyAnalytics(weeklyAnalytics);
        
        totalSaved += result.saved;
        allErrors.push(...result.errors);
        
        console.log(`[Save Weekly Analytics] Saved ${result.saved} records for week ${weekStart}`);
        
      } catch (weekError: any) {
        console.error(`[Save Weekly Analytics]  Error processing week ${weekStart}:`, weekError.message);
        allErrors.push({
          week: { start: weekStart, end: weekEnd },
          error: weekError.message
        });
      }
    }

    console.log(`\n[Save Weekly Analytics]  Complete!`);
    console.log(`[Save Weekly Analytics] Total records saved: ${totalSaved}`);
    console.log(`[Save Weekly Analytics] Weeks processed: ${weekPeriods.length}`);
    if (allErrors.length > 0) {
      console.log(`[Save Weekly Analytics]  Errors encountered: ${allErrors.length}`);
    }

    return {
      savedCount: totalSaved,
      weeksSaved: weekPeriods.length,
      dateRange: {
        start: startDate,
        end: endDate
      },
      errors: allErrors
    };
    
  } catch (error: any) {
    console.error('[Save Weekly Analytics]  Fatal error:', error.message);
    throw error;
  }
}

/**
 * Get saved weekly analytics from database
 */
export async function getSavedWeeklyAnalytics({
  clientId,
  startDate,
  endDate
}: {
  clientId: string;
  startDate: string;
  endDate: string;
}) {
  console.log(`\n[Get Saved Analytics] 📖 Fetching from DB for client ${clientId}`);
  console.log(`[Get Saved Analytics] Date Range: ${startDate} to ${endDate}`);

  const analytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
    clientId,
    startDate,
    endDate
  );

  console.log(`[Get Saved Analytics] ✓ Found ${analytics.length} weekly records in database`);
  return analytics;
}
