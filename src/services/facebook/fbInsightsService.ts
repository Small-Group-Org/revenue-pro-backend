// fbInsightsService.ts
import { fbGet } from './fbClient.js';

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

export async function getAdInsights({
  adAccountId,
  since,
  until,
  accessToken,
}: {
  adAccountId: string;
  since: string;
  until: string;
  accessToken: string;
}): Promise<AdInsight[]> {
  console.log(`[Insights] Fetching ad insights for ${adAccountId} from ${since} to ${until}`);
  
  if (!adAccountId) {
    throw new Error('adAccountId is required');
  }
  if (!accessToken) {
    throw new Error('Meta access token is required');
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
      'spend',
      'date_start',
      'date_stop',
    ].join(','),
    'time_range[since]': since,
    'time_range[until]': until,
    limit: 500,
  };

  const res = await fbGet(`/${adAccountId}/insights`, params, accessToken);
  const insights: AdInsight[] = res.data || [];
  console.log(`[Insights] Retrieved ${insights.length} insight rows`);
  return insights;
}
