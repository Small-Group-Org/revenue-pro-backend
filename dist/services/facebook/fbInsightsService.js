// fbInsightsService.ts
import { fbGet } from './fbClient.js';
export async function getAdInsights({ adAccountId, since, until, accessToken, }) {
    console.log(`[Insights] Fetching comprehensive ad insights for ${adAccountId} from ${since} to ${until}`);
    if (!adAccountId) {
        throw new Error('adAccountId is required');
    }
    if (!accessToken) {
        throw new Error('Meta access token is required');
    }
    const params = {
        level: 'ad',
        fields: [
            // ===== IDENTIFIERS =====
            'ad_id',
            'ad_name',
            'adset_id',
            'adset_name',
            'campaign_id',
            'campaign_name',
            // ===== CAMPAIGN SETTINGS =====
            'objective',
            'buying_type',
            // ===== BASIC PERFORMANCE =====
            'impressions',
            'reach',
            'frequency',
            'clicks',
            'unique_clicks',
            'ctr',
            'unique_ctr',
            'cpc',
            'cpm',
            'cpp',
            // ===== SPEND =====
            'spend',
            // ===== LINK CLICKS =====
            'inline_link_clicks',
            'outbound_clicks',
            'unique_outbound_clicks',
            'inline_link_click_ctr',
            'cost_per_inline_link_click',
            // ===== ENGAGEMENT =====
            'inline_post_engagement',
            // ===== QUALITY RANKING =====
            'quality_ranking',
            // ===== VIDEO METRICS =====
            'video_30_sec_watched_actions',
            'video_p25_watched_actions',
            'video_p50_watched_actions',
            'video_p75_watched_actions',
            'video_p100_watched_actions',
            'video_avg_time_watched_actions',
            'video_play_actions',
            'video_thruplay_watched_actions',
            // ===== ACTIONS & CONVERSIONS (Most Important) =====
            'actions',
            'action_values',
            'cost_per_action_type',
            'conversions',
            'conversion_values',
            // ===== ROAS =====
            'purchase_roas',
            // ===== DATE RANGE =====
            'date_start',
            'date_stop',
        ].join(','),
        'time_range[since]': since,
        'time_range[until]': until,
        limit: 500,
    };
    const res = await fbGet(`/${adAccountId}/insights`, params, accessToken);
    const insights = res.data || [];
    console.log(`[Insights] Retrieved ${insights.length} comprehensive insight rows`);
    return insights;
}
