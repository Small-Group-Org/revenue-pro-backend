// fbInsightsService.ts
import { fbGet } from './fbClient.js';

const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;

interface AdInsight {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  date_start: string;
  date_stop: string;
}

export async function getAdInsights({ since, until }: { since: string; until: string }): Promise<AdInsight[]> {
  console.log(`[Insights] Fetching ad insights from ${since} to ${until}`);
  
  if (!AD_ACCOUNT_ID) {
    throw new Error('FB_AD_ACCOUNT_ID not set');
  }

  const params = {
    level: 'ad',
    fields: [
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'impressions',
      'clicks',
      'spend',
      'date_start',
      'date_stop',
    ].join(','),
    'time_range[since]': since,
    'time_range[until]': until,
    limit: 500,
  };

  const res = await fbGet(`/${AD_ACCOUNT_ID}/insights`, params);
  const insights: AdInsight[] = res.data || [];
  console.log(`[Insights] ✅ Retrieved ${insights.length} insight rows`);
  return insights;
}
