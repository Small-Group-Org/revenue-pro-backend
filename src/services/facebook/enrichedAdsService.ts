// enrichedAdsService.ts
import { getAdInsights } from './fbInsightsService.js';
import { getAdsWithCreatives, mapAdWithCreative } from './fbAdsService.js';
import { getLeadForms } from './fbLeadFormsService.js';
import { DateUtils } from '../../utils/date.utils.js';

interface EnrichedAd {
  campaign: {
    id: string;
    name: string;
  };
  adset: {
    id: string;
    name: string;
  };
  ad: {
    id: string;
    name: string;
  };
  creative: {
    id: string | null;
    name: string | null;
    primary_text: string | null;
    headline: string | null;
    raw: any;
  } | null;
  lead_form: {
    id: string;
    name: string;
  } | null;
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    date_start: string;
    date_stop: string;
  };
}

interface WeeklyMetaSpend {
  startDate: string;
  endDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  adAccountId: string;
}

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
  
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }
  
  // For monthly/yearly queries, split into weeks like actuals
  if (queryType === 'monthly' || queryType === 'yearly') {
    return await getWeeklyMetaSpend(adAccountId, startDate, endDate, queryType, accessToken);
  }

  // For weekly queries, return detailed enriched ads (original behavior)
  // 1) Insights
  console.log('[Enriched Ads] Step 1: Fetching insights...');
  const insightsRows = await getAdInsights({ adAccountId, since: startDate, until: endDate, accessToken });
  if (!insightsRows.length) {
    console.log('[Enriched Ads] No insights found');
    return [];
  }

  const uniqueAdIds = Array.from(
    new Set(insightsRows.map(row => row.ad_id))
  );
  console.log(`[Enriched Ads] Found ${uniqueAdIds.length} unique ad IDs`);

  // 2) Ads + creatives
  console.log('[Enriched Ads] Step 2: Fetching ads with creatives...');
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

  // 3) Leadgen forms
  console.log(`[Enriched Ads] Step 3: Fetching ${formIdsSet.size} lead forms...`);
  const formMap = await getLeadForms(Array.from(formIdsSet), accessToken);

  // 4) Join into final structure per insight row
  console.log('[Enriched Ads] Step 4: Joining data...');
  const final: EnrichedAd[] = insightsRows.map(row => {
    const enriched = adEnrichedMap[row.ad_id] || {};
    const creative = enriched.creative || null;
    const formId = enriched.lead_gen_form_id || null;
    const form = formId ? formMap[formId] || null : null;

    return {
      campaign: {
        id: row.campaign_id,
        name: row.campaign_name,
      },
      adset: {
        id: row.adset_id,
        name: row.adset_name,
      },
      ad: {
        id: row.ad_id,
        name: row.ad_name,
      },
      creative: creative,
      lead_form: form
        ? { id: form.id, name: form.name }
        : null,
      insights: {
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        spend: Number(row.spend || 0),
        date_start: row.date_start,
        date_stop: row.date_stop,
      },
    };
  });

  console.log(`[Enriched Ads] Enrichment complete! ${final.length} records enriched\n`);
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
