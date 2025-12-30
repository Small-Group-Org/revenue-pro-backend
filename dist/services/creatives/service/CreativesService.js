import { fbGet } from '../../facebook/fbClient.js';
import { creativesRepository } from '../repository/CreativesRepository.js';
export class CreativesService {
    /**
     * Fetch creative details from Facebook API
     */
    async fetchCreativeFromFacebook(creativeId, accessToken) {
        console.log(`[Creatives] Fetching creative ${creativeId} from Facebook`);
        const fields = [
            'id',
            'name',
            'body',
            'title',
            'thumbnail_url',
            'image_url',
            'image_hash',
            'video_id',
            'call_to_action',
            'object_story_spec',
            'asset_feed_spec',
            'object_story_id',
            'effective_object_story_id'
        ].join(',');
        const creativeData = await fbGet(`/${creativeId}`, { fields }, accessToken);
        return creativeData;
    }
    /**
     * Fetch video details from Facebook API
     */
    async fetchVideoDetails(videoId, accessToken) {
        try {
            console.log(`[Creatives] Fetching video details for ${videoId}`);
            const fields = 'source,picture,length,thumbnails';
            const videoData = await fbGet(`/${videoId}`, { fields }, accessToken);
            return videoData;
        }
        catch (error) {
            console.error(`[Creatives] Error fetching video ${videoId}:`, error.message || error);
            return null;
        }
    }
    /**
     * Parse and normalize creative data from Facebook API
     */
    async parseCreativeData(creativeData, adAccountId, accessToken) {
        const oss = creativeData.object_story_spec || {};
        const linkData = oss.link_data || {};
        const photoData = oss.photo_data || {};
        const videoData = oss.video_data || {};
        // Determine creative type
        let creativeType = 'other';
        const videoId = videoData.video_id || creativeData.video_id || null;
        if (videoId) {
            creativeType = 'video';
        }
        else if (linkData.child_attachments && linkData.child_attachments.length > 0) {
            creativeType = 'carousel';
        }
        else if (photoData.image_hash || creativeData.image_hash || creativeData.image_url) {
            creativeType = 'image';
        }
        else if (linkData.link) {
            creativeType = 'link';
        }
        // Fetch video details if video creative
        let videos = [];
        if (videoId) {
            const videoDetails = await this.fetchVideoDetails(videoId, accessToken);
            if (videoDetails) {
                videos = [{
                        id: videoId,
                        url: videoDetails.source || null,
                        thumbnailUrl: videoDetails.picture || creativeData.thumbnail_url || null,
                        duration: videoDetails.length || null
                    }];
            }
        }
        // Parse carousel attachments
        const childAttachments = (linkData.child_attachments || []).map((child) => ({
            name: child.name || null,
            description: child.description || null,
            imageUrl: child.image_url || null,
            imageHash: child.image_hash || null,
            link: child.link || null,
            videoId: child.video_id || null
        }));
        // Parse call to action
        const callToAction = creativeData.call_to_action || linkData.call_to_action || videoData.call_to_action || null;
        return {
            creativeId: creativeData.id,
            adAccountId,
            name: creativeData.name || null,
            primaryText: creativeData.body || linkData.message || photoData.message || videoData.message || null,
            headline: creativeData.title || linkData.name || null,
            description: linkData.description || null,
            body: creativeData.body || null,
            thumbnailUrl: creativeData.thumbnail_url || null,
            imageUrl: creativeData.image_url || photoData.url || linkData.picture || null,
            imageHash: creativeData.image_hash || photoData.image_hash || null,
            videoId,
            images: [],
            videos,
            childAttachments,
            callToAction,
            creativeType,
            objectStorySpec: oss,
            rawData: creativeData,
            lastFetchedAt: new Date()
        };
    }
    /**
     * Get creative by ID (from DB or fetch from Facebook)
     */
    async getCreative(creativeId, adAccountId, accessToken, forceRefresh = false) {
        if (!creativeId)
            return null;
        // Check if creative exists in DB and is recent (< 7 days old)
        if (!forceRefresh) {
            const cached = await creativesRepository.getCreativeById(creativeId);
            if (cached && cached.lastFetchedAt) {
                const daysSinceUpdate = (Date.now() - new Date(cached.lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate < 7) {
                    console.log(`[Creatives] Using cached creative ${creativeId}`);
                    return cached;
                }
            }
        }
        // Fetch from Facebook API
        try {
            const creativeData = await this.fetchCreativeFromFacebook(creativeId, accessToken);
            const parsedCreative = await this.parseCreativeData(creativeData, adAccountId, accessToken);
            // Save to database
            const updated = await creativesRepository.upsertCreative(parsedCreative);
            console.log(`[Creatives] Cached creative ${creativeId}`);
            return updated;
        }
        catch (error) {
            console.error(`[Creatives] Error fetching creative ${creativeId}:`, error.message || error);
            // Return cached version if available (even if stale)
            const cached = await creativesRepository.getCreativeById(creativeId);
            return cached || null;
        }
    }
    /**
     * Batch get creatives
     */
    async getCreatives(creativeIds, adAccountId, accessToken) {
        if (!creativeIds || creativeIds.length === 0)
            return {};
        const uniqueIds = Array.from(new Set(creativeIds.filter(id => id)));
        console.log(`[Creatives] Fetching ${uniqueIds.length} creatives`);
        // Get cached creatives
        const cached = await creativesRepository.getCreativesByIds(uniqueIds);
        const cachedMap = {};
        const now = Date.now();
        cached.forEach(c => {
            const daysSinceUpdate = (now - new Date(c.lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUpdate < 7) {
                cachedMap[c.creativeId] = c;
            }
        });
        // Determine which creatives need to be fetched
        const toFetch = uniqueIds.filter(id => !cachedMap[id]);
        if (toFetch.length === 0) {
            console.log(`[Creatives] All ${uniqueIds.length} creatives cached`);
            return cachedMap;
        }
        console.log(`[Creatives] Need to fetch ${toFetch.length} creatives from Facebook`);
        // Fetch missing creatives in parallel (limit concurrency to avoid rate limits)
        const BATCH_SIZE = 10;
        for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
            const batch = toFetch.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (creativeId) => {
                try {
                    const creative = await this.getCreative(creativeId, adAccountId, accessToken, true);
                    if (creative) {
                        cachedMap[creativeId] = creative;
                    }
                }
                catch (error) {
                    console.error(`[Creatives] Failed to fetch creative ${creativeId}:`, error.message || error);
                }
            }));
        }
        console.log(`[Creatives] Total creatives available: ${Object.keys(cachedMap).length}`);
        return cachedMap;
    }
    /**
     * Fetch and save all creatives for ads in a date range
     */
    async fetchAndSaveCreativesForClient(clientId, adAccountId, accessToken, startDate, endDate) {
        console.log(`[Creatives] Fetching creatives for client ${clientId} from ${startDate} to ${endDate}`);
        // Import fbWeeklyAnalytics repository to get creative IDs
        const { fbWeeklyAnalyticsRepository } = await import('../../facebook/repository/FbWeeklyAnalyticsRepository.js');
        // Get all analytics for the date range
        const analytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(clientId, startDate, endDate);
        // Extract unique creative IDs
        const creativeIds = Array.from(new Set(analytics
            .map(a => a.creative?.id)
            .filter((id) => !!id)));
        console.log(`[Creatives] Found ${creativeIds.length} unique creatives to fetch`);
        if (creativeIds.length === 0) {
            return { saved: 0, failed: 0, creativeIds: [] };
        }
        // Fetch and save all creatives
        let saved = 0;
        let failed = 0;
        const BATCH_SIZE = 10;
        for (let i = 0; i < creativeIds.length; i += BATCH_SIZE) {
            const batch = creativeIds.slice(i, i + BATCH_SIZE);
            console.log(`[Creatives] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(creativeIds.length / BATCH_SIZE)}`);
            await Promise.all(batch.map(async (creativeId) => {
                try {
                    await this.getCreative(creativeId, adAccountId, accessToken, true);
                    saved++;
                }
                catch (error) {
                    console.error(`[Creatives] Failed to fetch creative ${creativeId}:`, error.message || error);
                    failed++;
                }
            }));
        }
        console.log(`[Creatives] Completed: ${saved} saved, ${failed} failed`);
        return { saved, failed, creativeIds };
    }
}
export const creativesService = new CreativesService();
