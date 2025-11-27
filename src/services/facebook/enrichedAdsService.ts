// enrichedAdsService.ts
import { getAdInsights } from './fbInsightsService.js';
import { getAdsWithCreatives, mapAdWithCreative } from './fbAdsService.js';
import { getLeadForms } from './fbLeadFormsService.js';

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

export async function getEnrichedAds({ since, until }: { since: string; until: string }): Promise<EnrichedAd[]> {
  console.log(`\n[Enriched Ads] 🚀 Starting enrichment process for ${since} to ${until}`);
  
  // 1) Insights
  console.log('[Enriched Ads] Step 1: Fetching insights...');
  const insightsRows = await getAdInsights({ since, until });
  if (!insightsRows.length) {
    console.log('[Enriched Ads] ⚠️  No insights found');
    return [];
  }

  const uniqueAdIds = Array.from(
    new Set(insightsRows.map(row => row.ad_id))
  );
  console.log(`[Enriched Ads] Found ${uniqueAdIds.length} unique ad IDs`);

  // 2) Ads + creatives
  console.log('[Enriched Ads] Step 2: Fetching ads with creatives...');
  const adsMapRaw = await getAdsWithCreatives(uniqueAdIds);

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
  const formMap = await getLeadForms(Array.from(formIdsSet));

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

  console.log(`[Enriched Ads] ✅ Enrichment complete! ${final.length} records enriched\n`);
  return final;
}
