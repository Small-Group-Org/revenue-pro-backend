import { fbGet } from '../../facebook/fbClient.js';
import { creativesRepository } from '../repository/CreativesRepository.js';
import { ICreative } from '../domain/creatives.domain.js';

export class CreativesService {
  /**
   * Transform thumbnail URL to high-resolution URL by manipulating Facebook CDN parameters
   */
  private getHighResImageUrl(thumbnailUrl: string): string {
    if (!thumbnailUrl) return thumbnailUrl;
    
    // Facebook CDN URLs support size parameters
    // Transform to get higher resolution
      if (thumbnailUrl.includes('fbcdn.net')) {
        // Remove size restrictions from URL
        let highResUrl = thumbnailUrl
          .replace(/\/s\d+x\d+\//g, '/') // Remove size restrictions like /s320x320/
          .replace(/\/(p|cp)\d+x\d+\//g, '/') // Remove crop/profile sizes
          .replace(/_s\./, '_o.'); // Change _s (small) to _o (original)
        return highResUrl;
      }
      return thumbnailUrl;
  }

  /**
   * Fetch image URL from hash via Facebook API
   */
  private async fetchImageUrlFromHash(
    imageHash: string,
    adAccountId: string,
    accessToken: string
  ): Promise<{ url: string | null; width: number | null; height: number | null }> {
    if (!imageHash) return { url: null, width: null, height: null };
    
    try {
      const accountId = adAccountId.replace('act_', '');
      
      // Try Method 1: adimages endpoint with ALL fields
      try {
        const response = await fbGet(`/${accountId}/adimages`, {
          hashes: [imageHash],
          // Request ALL available fields
          fields: 'id,account_id,hash,height,width,name,url,url_128,permalink_url,created_time,updated_time'
        }, accessToken);
        
        console.log('[IMAGE HASH] Full response:', JSON.stringify(response, null, 2));
        
        if (response?.data) {
          let imageData = null;
          
          // Handle object format: { data: { hash: { url: "..." } } }
          if (typeof response.data === 'object' && !Array.isArray(response.data)) {
            imageData = response.data[imageHash];
          }
          // Handle array format: { data: [{ hash: "...", url: "..." }] }
          else if (Array.isArray(response.data)) {
            imageData = response.data.find((img: any) => img.hash === imageHash) || response.data[0];
          }
          
          if (imageData) {
            // Try all possible URL fields
            const possibleUrls = [
              imageData.url_128,  // Usually full-res despite name
              imageData.url,
              imageData.permalink_url
            ].filter(Boolean);
            
            
            if (possibleUrls.length > 0) {
              return {
                url: possibleUrls[0],
                width: imageData.width || null,
                height: imageData.height || null
              };
            }
          }
        }
      } catch (err: any) {
      }
      
      // Try Method 2: Direct hash lookup as endpoint
      try {
        const directResponse = await fbGet(`/${imageHash}`, {
          fields: 'url,url_128,permalink_url,height,width'
        }, accessToken);
        
        
        if (directResponse) {
          const url = directResponse.url_128 || directResponse.url || directResponse.permalink_url || null;
          if (url) {
            return {
              url,
              width: directResponse.width || null,
              height: directResponse.height || null
            };
          }
        }
      } catch (err: any) {
      }
      
      return { url: null, width: null, height: null };
      
    } catch (error: any) {
      console.error(`[IMAGE HASH] Fatal error:`, error);
      return { url: null, width: null, height: null };
    }
  }

  /**
   * Fetch creative details from Facebook API
   */
  async fetchCreativeFromFacebook(
    creativeId: string,
    accessToken: string
  ): Promise<any> {
    
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
      'effective_object_story_id',
      'effective_instagram_story_id'
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
      
      // Request EVERY possible image field
      const fields = [
        'attachments{media,media_type,subattachments,url,unshimmed_url,target{id}}',
        'full_picture',  // Highest quality available
        'picture',       // Standard quality
        'images'         // All available sizes
      ].join(',');
      
      const postData = await fbGet(`/${postId}`, { fields }, accessToken);
      
      
      // Priority 1: full_picture (highest quality)
      if (postData.full_picture) {
        return {
          imageUrl: postData.full_picture,
          thumbnailUrl: postData.full_picture
        };
      }
      
      // Priority 2: images array (select largest)
      if (postData.images && Array.isArray(postData.images)) {
        const largestImage = postData.images.reduce((largest: any, current: any) => {
          const largestSize = (largest.width || 0) * (largest.height || 0);
          const currentSize = (current.width || 0) * (current.height || 0);
          return currentSize > largestSize ? current : largest;
        });
        
        if (largestImage?.source) {
          return {
            imageUrl: largestImage.source,
            thumbnailUrl: largestImage.source
          };
        }
      }
      
      // Priority 3: attachments.media
      const attachments = postData?.attachments?.data?.[0];
      if (attachments?.media?.image?.src) {
        return {
          imageUrl: attachments.media.image.src,
          thumbnailUrl: attachments.media.image.src
        };
      }
      
      // Priority 4: Regular picture field
      if (postData.picture) {
        return {
          imageUrl: postData.picture,
          thumbnailUrl: postData.picture
        };
      }
      
      return { imageUrl: null, thumbnailUrl: null };
      
    } catch (error: any) {
      console.error(`[POST] Error:`, error.message);
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
      // Only classify based on ad_formats if actual media data exists
      const adFormats = assetFeedSpec.ad_formats || [];
      const assetImages = assetFeedSpec.images || [];
      const assetVideos = assetFeedSpec.videos || [];
      
      if (adFormats.includes('SINGLE_VIDEO') && assetVideos.length > 0) {
        creativeType = 'video'; // Advantage+ video with actual video data
      } else if (adFormats.includes('CAROUSEL')) {
        creativeType = 'carousel'; // Advantage+ carousel
      } else if (adFormats.includes('SINGLE_IMAGE') && assetImages.length > 0) {
        creativeType = 'image'; // Advantage+ single image with actual image data
      } else {
        // Default for Advantage+ without clear media - will be validated later
        creativeType = 'other';
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
      const videoDetails = await this.fetchVideoDetails(videoId, accessToken);
      if (videoDetails) {
        const videoObject = {
          id: videoId,
          url: videoDetails.source || null,
          thumbnailUrl: videoDetails.picture || creativeData.thumbnail_url || null,
          duration: videoDetails.length || null
        };
        videos = [videoObject];
      }
    }

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

    console.log(`\n[🔍 IMAGES] Starting image resolution for creative ${creativeData.id}`);

    // Step 2: Get all possible sources
    let finalImageUrl = highQualityImages.imageUrl || 
                        creativeData.image_url || 
                        photoData.url || 
                        linkData.picture || 
                        null;
                        
    let finalThumbnailUrl = highQualityImages.thumbnailUrl || 
                            creativeData.thumbnail_url || 
                            null;
                            
    let finalImageHash = creativeData.image_hash || 
                         photoData.image_hash || 
                         assetFeedData?.imageHash || 
                         null;

    console.log(`[IMAGES] After initial sources:`, {
      imageUrl: finalImageUrl,
      thumbnailUrl: finalThumbnailUrl,
      imageHash: finalImageHash,
      sources: {
        highQualityImageUrl: highQualityImages.imageUrl,
        directImageUrl: creativeData.image_url,
        photoDataUrl: photoData.url,
        linkDataPicture: linkData.picture,
        directThumbnail: creativeData.thumbnail_url
      }
    });

    // Step 3: If we have hash, fetch from hash
    if (finalImageHash) {
      console.log(`[IMAGES] Have hash ${finalImageHash}, fetching...`);
      const hashResult = await this.fetchImageUrlFromHash(finalImageHash, adAccountId, accessToken);
      
      if (hashResult.url) {
        if (!finalImageUrl) {
          finalImageUrl = hashResult.url;
        }
        if (!finalThumbnailUrl) {
          finalThumbnailUrl = hashResult.url;
        }
      }
    }
    
    // Step 4: Transform thumbnail to high-res if no imageUrl
    if (!finalImageUrl && finalThumbnailUrl) {
      console.log(`[IMAGES] No imageUrl but have thumbnail, attempting transformation...`);
      const highResFromThumbnail = this.getHighResImageUrl(finalThumbnailUrl);
      if (highResFromThumbnail !== finalThumbnailUrl) {
        finalImageUrl = highResFromThumbnail;
      }
    }
    
    // Step 5: Transform URLs if they're Facebook CDN
    if (finalImageUrl && finalImageUrl.includes('fbcdn.net')) {
      finalImageUrl = this.getHighResImageUrl(finalImageUrl);
    }
    if (finalThumbnailUrl && finalThumbnailUrl.includes('fbcdn.net')) {
      finalThumbnailUrl = this.getHighResImageUrl(finalThumbnailUrl);
    }

    console.log(`[IMAGES] FINAL RESULT:`, {
      imageUrl: finalImageUrl,
      thumbnailUrl: finalThumbnailUrl,
      imageHash: finalImageHash,
      creativeType
    });

    // VALIDATION: Ensure we have actual media for the classified type
    // This must happen BEFORE returning the object to prevent saving invalid data
    
    // If classified as video but no video data retrieved, downgrade to other
    if (creativeType === 'video' && (!videoId || videos.length === 0)) {
      creativeType = 'other';
    }
    
    // If classified as image but no actual image URL, thumbnail, or hash, downgrade to other
    if (creativeType === 'image' && !finalImageUrl && !finalThumbnailUrl && !finalImageHash) {
      console.log(`[Creatives] ❌ Creative ${creativeData.id}: Classified as image but no image data at all (no URL, thumbnail, or hash), changing to 'other'`);
      creativeType = 'other';
    }
    
    // Warn if image type but missing URL (even with hash)
    if (creativeType === 'image' && !finalImageUrl && !finalThumbnailUrl) {
      console.warn(`[Creatives] ⚠️ Creative ${creativeData.id}: Type 'image' but no image URL/thumbnail (hash: ${finalImageHash || 'none'})`);
    }
    
    // If classified as carousel but no child attachments, downgrade to other
    if (creativeType === 'carousel' && childAttachments.length === 0) {
      console.log(`[Creatives] ❌ Creative ${creativeData.id}: Classified as carousel but no child attachments found, changing to 'other'`);
      creativeType = 'other';
    }

    // Get text content for final validation
    const hasPrimaryText = assetFeedData?.primaryText || creativeData.body || linkData.message || photoData.message || videoData.message;
    const hasHeadline = assetFeedData?.headline || creativeData.title || linkData.name;
    const hasDescription = assetFeedData?.description || linkData.description;
    const hasTextContent = hasPrimaryText || hasHeadline || hasDescription;

    // Log warning if 'other' type with no content at all
    if (creativeType === 'other') {
      if (!hasTextContent && !finalImageUrl && !finalThumbnailUrl && !finalImageHash) {
        console.warn(`[Creatives] ⚠️ Creative ${creativeData.id}: Type 'other' with NO content at all (no text, no images)`);
      }
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
