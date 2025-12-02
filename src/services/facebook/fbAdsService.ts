// fbAdsService.ts
import { fbGet } from './fbClient.js';

interface Creative {
  id?: string;
  name?: string;
  body?: string;
  title?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      description?: string;
      caption?: string;
      call_to_action?: {
        type?: string;
        value?: {
          lead_gen_form_id?: string;
          link?: string;
        };
      };
    };
  };
}

interface AdWithCreative {
  id: string;
  name: string;
  campaign_id: string;
  adset_id: string;
  creative?: Creative;
}

interface NormalizedAd {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  campaign_id: string;
  creative: {
    id: string | null;
    name: string | null;
    primary_text: string | null;
    headline: string | null;
    raw: Creative;
  };
  lead_gen_form_id: string | null;
}

/**
 * Batch fetch Ads with nested creative
 * @param adIds - Array of ad IDs
 * @param accessToken - Meta access token for this request
 * @returns Object keyed by adId
 */
export async function getAdsWithCreatives(
  adIds: string[],
  accessToken: string
): Promise<Record<string, AdWithCreative>> {
  if (!adIds || adIds.length === 0) return {};
  if (!accessToken) {
    throw new Error('Meta access token is required');
  }

  console.log(`[Ads] Fetching ${adIds.length} ads with creatives`);
  console.log(`[Ads] Ad IDs:`, adIds.join(', '));

  const params = {
    ids: adIds.join(','),
    fields: [
      'id',
      'name',
      'campaign_id',
      'adset_id',
      'creative{id,name,body,title,object_story_spec{link_data{message,name,description,caption,call_to_action{type,value}}}}',
    ].join(','),
  };

  // Root path `/` for multi-id
  const res = await fbGet('/', params, accessToken);
  console.log(`[Ads] Retrieved ${Object.keys(res).length} ads`);
  return res;
}

/**
 * Normalize creative data for a single ad object
 */
export function mapAdWithCreative(adObj: AdWithCreative): NormalizedAd {
  const creative = adObj.creative || {};
  const oss = creative.object_story_spec || {};
  const linkData = oss.link_data || {};
  const callToAction = linkData.call_to_action || {};
  const ctaValue = callToAction.value || {};

  const primaryText = creative.body || linkData.message || null;
  const headline = creative.title || linkData.name || null;
  const leadGenFormId = ctaValue.lead_gen_form_id || null;

  return {
    ad_id: adObj.id,
    ad_name: adObj.name,
    adset_id: adObj.adset_id,
    campaign_id: adObj.campaign_id,
    creative: {
      id: creative.id || null,
      name: creative.name || null,
      primary_text: primaryText,
      headline: headline,
      raw: creative,
    },
    lead_gen_form_id: leadGenFormId,
  };
}
