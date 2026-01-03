import { fbGet } from '../../facebook/fbClient.js';
import { creativesRepository } from '../repository/CreativesRepository.js';
import { ICreative } from '../domain/creatives.domain.js';

export class CreativesService {
  /**
   * Fetch image URL from hash via Facebook API
   */
  private async fetchImageUrlFromHash(
    imageHash: string,
    adAccountId: string,
    accessToken: string
  ): Promise<string | null> {
    if (!imageHash) return null;
    
    try {
      console.log(`[Creatives] Fetching image URL for hash ${imageHash}`);
      const accountId = adAccountId.replace('act_', '');
      
      // Use Ad Images endpoint to get the actual image URL
      const response = await fbGet(`/${accountId}/adimages`, {
        hashes: [imageHash]
      }, accessToken);
      
      // Response format: { "data": { "hash": { "url": "...", "permalink_url": "..." } } }
      const imageData = response?.data?.[imageHash];
      const imageUrl = imageData?.url || imageData?.permalink_url || null;
      
      console.log(`[Creatives] Image URL for hash ${imageHash}: ${imageUrl}`);
      return imageUrl;
    } catch (error: any) {
      console.error(`[Creatives] Failed to fetch image URL from hash ${imageHash}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch creative details from Facebook API
   */
  async fetchCreativeFromFacebook(
    creativeId: string,
    accessToken: string
  ): Promise<any> {
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
  async fetchVideoDetails(
    videoId: string,
    accessToken: string
  ): Promise<any> {
    try {
      console.log(`[Creatives] Fetching video details for ${videoId}`);
      const fields = 'source,picture,length,thumbnails.limit(1){uri,width,height,scale,is_preferred}';
      
      const videoData = await fbGet(`/${videoId}`, { fields }, accessToken);
      
      // Get the highest quality thumbnail available
      let highQualityThumbnail = videoData.picture;
      if (videoData.thumbnails?.data?.length > 0) {
        // Sort thumbnails by scale/size and get the largest one
        const thumbnails = videoData.thumbnails.data;
        const largestThumbnail = thumbnails.reduce((prev: any, current: any) => {
          const prevScale = prev.scale || prev.width || 0;
          const currentScale = current.scale || current.width || 0;
          return currentScale > prevScale ? current : prev;
        });
        highQualityThumbnail = largestThumbnail.uri || highQualityThumbnail;
      }
      
      return {
        ...videoData,
        picture: highQualityThumbnail
      };
    } catch (error: any) {
      // Log but don't throw - allow creative to be saved without video details
      console.error(`[Creatives] Error fetching video ${videoId}:`, error.message || error);
      return null;
    }
  }

  /**
   * Fetch high-quality images from post using effective_object_story_id
   */
  async fetchPostAttachments(
    postId: string,
    accessToken: string
  ): Promise<{ imageUrl: string | null; thumbnailUrl: string | null }> {
    try {
      console.log(`[Creatives] Fetching post attachments for ${postId}`);
      const fields = 'attachments{media,media_type,subattachments,url,unshimmed_url}';
      const postData = await fbGet(`/${postId}`, { fields }, accessToken);
      
      const attachments = postData?.attachments?.data?.[0];
      if (!attachments) {
        return { imageUrl: null, thumbnailUrl: null };
      }

      // Get the media object which contains full_picture
      const media = attachments.media;
      if (media?.image) {
        // Request high-quality image by accessing image with src
        const imageUrl = media.image.src || null;
        return {
          imageUrl: imageUrl,
          thumbnailUrl: imageUrl // Same URL, but we store it for consistency
        };
      }

      return { imageUrl: null, thumbnailUrl: null };
    } catch (error: any) {
      console.log(`[Creatives] Could not fetch post attachments: ${error.message}`);
      return { imageUrl: null, thumbnailUrl: null };
    }
  }

  /**
   * Parse and normalize creative data from Facebook API
   */
  private async parseCreativeData(
    creativeData: any, 
    adAccountId: string, 
    accessToken: string
  ): Promise<Partial<ICreative>> {
    const oss = creativeData.object_story_spec || {};
    const linkData = oss.link_data || {};
    const photoData = oss.photo_data || {};
    const videoData = oss.video_data || {};
    const assetFeedSpec = creativeData.asset_feed_spec || {};
    
    // Determine creative type
    let creativeType: 'image' | 'video' | 'carousel' | 'link' | 'other' = 'other';
    const videoId = videoData.video_id || creativeData.video_id || null;
    
    if (videoId) {
      creativeType = 'video';
    } else if (linkData.child_attachments && linkData.child_attachments.length > 0) {
      creativeType = 'carousel';
    } else if (photoData.image_hash || creativeData.image_hash || creativeData.image_url) {
      creativeType = 'image';
    } else if (Object.keys(assetFeedSpec).length > 0) {
      // Advantage+ Creative / Dynamic Format - has asset_feed_spec
      const adFormats = assetFeedSpec.ad_formats || [];
      if (adFormats.includes('SINGLE_IMAGE')) {
        creativeType = 'image'; // Advantage+ single image
      } else if (adFormats.includes('CAROUSEL')) {
        creativeType = 'carousel'; // Advantage+ carousel
      } else if (adFormats.includes('SINGLE_VIDEO')) {
        creativeType = 'video'; // Advantage+ video
      } else {
        creativeType = 'image'; // Default to image for Advantage+ with asset_feed_spec
      }
    } else if (linkData.link) {
      creativeType = 'link';
    }

    // For creatives without direct image_url (Advantage+, other types, or links), fetch high-quality from post
    let highQualityImages: { imageUrl: string | null; thumbnailUrl: string | null } = { 
      imageUrl: null, 
      thumbnailUrl: null 
    };
    
    const effectiveStoryId = creativeData.effective_object_story_id || creativeData.object_story_id;
    const hasDirectImageUrl = creativeData.image_url || photoData.url;
    
    // Fetch high-quality images if:
    // 1. We have an effective_object_story_id AND
    // 2. Either no direct image URL OR it's an Advantage+ creative (has asset_feed_spec)
    if (effectiveStoryId && (!hasDirectImageUrl || Object.keys(assetFeedSpec).length > 0)) {
      try {
        highQualityImages = await this.fetchPostAttachments(effectiveStoryId, accessToken);
        // If we found high-quality images and type was 'other', reclassify as 'image'
        if (highQualityImages.imageUrl && creativeType === 'other') {
          creativeType = 'image';
        }
      } catch (error: any) {
        console.log(`[Creatives] Could not fetch post attachments (may need additional permissions): ${error.message}`);
        // Continue without high-quality images - use fallback
      }
    }

    // Fetch video details if video creative
    let videos: any[] = [];
    if (videoId) {
      console.log(`[Creatives] Found video ID: ${videoId} for creative ${creativeData.id}`);
      const videoDetails = await this.fetchVideoDetails(videoId, accessToken);
      console.log(`[Creatives] Video details for ${videoId}:`, JSON.stringify(videoDetails, null, 2));
      if (videoDetails) {
        const videoObject = {
          id: videoId,
          url: videoDetails.source || null,
          thumbnailUrl: videoDetails.picture || creativeData.thumbnail_url || null,
          duration: videoDetails.length || null
        };
        console.log(`[Creatives] Created video object:`, JSON.stringify(videoObject, null, 2));
        videos = [videoObject];
      } else {
        console.log(`[Creatives] No video details returned for ${videoId}`);
      }
    }
    console.log(`[Creatives] Final videos array for creative ${creativeData.id}:`, videos);

    // Parse carousel attachments
    const childAttachments = (linkData.child_attachments || []).map((child: any) => ({
      name: child.name || null,
      description: child.description || null,
      imageUrl: child.image_url || null,
      imageHash: child.image_hash || null,
      link: child.link || null,
      videoId: child.video_id || null
    }));

    // Extract data from asset_feed_spec (Advantage+ Creative)
    let assetFeedData: any = null;
    if (Object.keys(assetFeedSpec).length > 0) {
      // Extract first image hash from asset_feed_spec
      const assetImages = assetFeedSpec.images || [];
      const firstImageHash = assetImages[0]?.hash || null;
      
      // Extract first body text
      const assetBodies = assetFeedSpec.bodies || [];
      const firstBody = assetBodies[0]?.text || null;
      
      // Extract first title/headline
      const assetTitles = assetFeedSpec.titles || [];
      const firstTitle = assetTitles[0]?.text || null;
      
      // Extract first description
      const assetDescriptions = assetFeedSpec.descriptions || [];
      const firstDescription = assetDescriptions[0]?.text || null;
      
      // Extract call to action
      const assetCallToActions = assetFeedSpec.call_to_actions || [];
      const firstCta = assetCallToActions[0] || null;
      
      assetFeedData = {
        imageHash: firstImageHash,
        primaryText: firstBody,
        headline: firstTitle,
        description: firstDescription,
        callToAction: firstCta
      };
    }

    // Parse call to action - prioritize asset_feed_spec, then other sources
    const callToAction = assetFeedData?.callToAction || creativeData.call_to_action || linkData.call_to_action || videoData.call_to_action || null;

    // Prioritize high-quality images from post attachments, fallback to direct API fields, then asset_feed_spec
    let finalImageUrl = highQualityImages.imageUrl || creativeData.image_url || photoData.url || linkData.picture || null;
    let finalThumbnailUrl = highQualityImages.thumbnailUrl || creativeData.thumbnail_url || finalImageUrl || null;
    let finalImageHash = creativeData.image_hash || photoData.image_hash || assetFeedData?.imageHash || null;

    // If we have image hash but no image URL, try to fetch the URL from hash
    if (finalImageHash && !finalImageUrl) {
      console.log(`[Creatives] Creative ${creativeData.id} has image hash but no URL, fetching from hash...`);
      const imageUrlFromHash = await this.fetchImageUrlFromHash(finalImageHash, adAccountId, accessToken);
      if (imageUrlFromHash) {
        finalImageUrl = imageUrlFromHash;
        finalThumbnailUrl = finalThumbnailUrl || imageUrlFromHash;
        console.log(`[Creatives] ✅ Retrieved image URL from hash for creative ${creativeData.id}`);
      } else {
        console.log(`[Creatives] ⚠️ Failed to retrieve image URL from hash for creative ${creativeData.id}`);
      }
    }

    // VALIDATION: Ensure we have actual media for the classified type
    // If classified as video but no video data retrieved, downgrade to other
    if (creativeType === 'video' && (!videoId || videos.length === 0)) {
      console.log(`[Creatives] Creative ${creativeData.id}: Classified as video but no video found, changing to 'other'`);
      creativeType = 'other';
    }
    
    // If classified as image but no actual image URL or thumbnail, downgrade to other
    if (creativeType === 'image' && !finalImageUrl && !finalThumbnailUrl) {
      console.log(`[Creatives] Creative ${creativeData.id}: Classified as image but no image URL found, changing to 'other'`);
      creativeType = 'other';
    }
    
    // If classified as carousel but no child attachments, downgrade to other
    if (creativeType === 'carousel' && childAttachments.length === 0) {
      console.log(`[Creatives] Creative ${creativeData.id}: Classified as carousel but no child attachments found, changing to 'other'`);
      creativeType = 'other';
    }

    // Get text content for validation
    const hasPrimaryText = assetFeedData?.primaryText || creativeData.body || linkData.message || photoData.message || videoData.message;
    const hasHeadline = assetFeedData?.headline || creativeData.title || linkData.name;
    const hasDescription = assetFeedData?.description || linkData.description;
    const hasTextContent = hasPrimaryText || hasHeadline || hasDescription;

    // Log warning if creative has no media and no text
    if (creativeType === 'other' && !finalImageUrl && !finalThumbnailUrl && !hasTextContent) {
      console.warn(`[Creatives] Creative ${creativeData.id}: Type 'other' with no media or text content`);
    }

    return {
      creativeId: creativeData.id,
      adAccountId,
      name: creativeData.name || null,
      primaryText: assetFeedData?.primaryText || creativeData.body || linkData.message || photoData.message || videoData.message || null,
      headline: assetFeedData?.headline || creativeData.title || linkData.name || null,
      description: assetFeedData?.description || linkData.description || null,
      body: assetFeedData?.primaryText || creativeData.body || null,
      thumbnailUrl: finalThumbnailUrl,
      imageUrl: finalImageUrl,
      imageHash: finalImageHash,
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
  async getCreative(
    creativeId: string,
    adAccountId: string,
    accessToken: string,
    forceRefresh: boolean = false
  ): Promise<ICreative | null> {
    if (!creativeId) return null;

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
    } catch (error: any) {
      console.error(`[Creatives] Error fetching creative ${creativeId}:`, error.message || error);
      
      // Return cached version if available (even if stale)
      const cached = await creativesRepository.getCreativeById(creativeId);
      return cached || null;
    }
  }

  /**
   * Batch get creatives
   */
  async getCreatives(
    creativeIds: string[],
    adAccountId: string,
    accessToken: string
  ): Promise<Record<string, ICreative>> {
    if (!creativeIds || creativeIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(creativeIds.filter(id => id)));
    console.log(`[Creatives] Fetching ${uniqueIds.length} creatives`);

    // Get cached creatives
    const cached = await creativesRepository.getCreativesByIds(uniqueIds);
    const cachedMap: Record<string, ICreative> = {};
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
      
      await Promise.all(
        batch.map(async (creativeId) => {
          try {
            const creative = await this.getCreative(creativeId, adAccountId, accessToken, true);
            if (creative) {
              cachedMap[creativeId] = creative;
            }
          } catch (error: any) {
            console.error(`[Creatives] Failed to fetch creative ${creativeId}:`, error.message || error);
          }
        })
      );
    }

    console.log(`[Creatives] Total creatives available: ${Object.keys(cachedMap).length}`);
    return cachedMap;
  }

  /**
   * Fetch and save all creatives for ads in a date range
   */
  async fetchAndSaveCreativesForClient(
    clientId: string,
    adAccountId: string,
    accessToken: string,
    startDate: string,
    endDate: string
  ): Promise<{ saved: number; failed: number; creativeIds: string[] }> {
    console.log(`[Creatives] Fetching creatives for client ${clientId} from ${startDate} to ${endDate}`);

    // Import fbWeeklyAnalytics repository to get creative IDs
    const { fbWeeklyAnalyticsRepository } = await import('../../facebook/repository/FbWeeklyAnalyticsRepository.js');
    
    // Get all analytics for the date range
    const analytics = await fbWeeklyAnalyticsRepository.getAnalyticsByDateRange(
      clientId,
      startDate,
      endDate
    );

    // Extract unique creative IDs
    const creativeIds = Array.from(new Set(
      analytics
        .map(a => a.creative?.id)
        .filter((id): id is string => !!id)
    ));

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
      
      await Promise.all(
        batch.map(async (creativeId) => {
          try {
            await this.getCreative(creativeId, adAccountId, accessToken, true);
            saved++;
          } catch (error: any) {
            console.error(`[Creatives] Failed to fetch creative ${creativeId}:`, error.message || error);
            failed++;
          }
        })
      );
    }

    console.log(`[Creatives] Completed: ${saved} saved, ${failed} failed`);
    return { saved, failed, creativeIds };
  }
}

export const creativesService = new CreativesService();
