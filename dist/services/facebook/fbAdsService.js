// fbAdsService.ts
import { fbGet } from './fbClient.js';
/**
 * Batch fetch Ads with nested creative
 * @param adIds - Array of ad IDs
 * @param accessToken - Meta access token for this request
 * @returns Object keyed by adId
 */
export async function getAdsWithCreatives(adIds, accessToken) {
    if (!adIds || adIds.length === 0)
        return {};
    if (!accessToken) {
        throw new Error('Meta access token is required');
    }
    console.log(`[Ads] Fetching ${adIds.length} ads with creatives`);
    // Facebook API limit: max 50 IDs per request
    const MAX_IDS_PER_REQUEST = 50;
    const allResults = {};
    // Split adIds into chunks of 50
    for (let i = 0; i < adIds.length; i += MAX_IDS_PER_REQUEST) {
        const chunk = adIds.slice(i, i + MAX_IDS_PER_REQUEST);
        console.log(`[Ads] Processing batch ${Math.floor(i / MAX_IDS_PER_REQUEST) + 1} (${chunk.length} ads)`);
        const params = {
            ids: chunk.join(','),
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
        console.log(`[Ads] Retrieved ${Object.keys(res).length} ads from batch`);
        // Merge results
        Object.assign(allResults, res);
    }
    console.log(`[Ads] Total retrieved: ${Object.keys(allResults).length} ads`);
    return allResults;
}
/**
 * Normalize creative data for a single ad object
 */
export function mapAdWithCreative(adObj) {
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
