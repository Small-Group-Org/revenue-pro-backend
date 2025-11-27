// facebookAds.controller.ts
import { Request, Response } from 'express';
import { getEnrichedAds } from '../services/facebook/enrichedAdsService.js';

export class FacebookAdsController {
  constructor() {
    this.getEnrichedAds = this.getEnrichedAds.bind(this);
  }

  /**
   * Get enriched Facebook ads data with insights, creatives, and lead forms
   * GET /api/v1/facebook/enriched-ads?since=YYYY-MM-DD&until=YYYY-MM-DD
   */
  async getEnrichedAds(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] 📥 Request received: GET /api/v1/facebook/enriched-ads`);
    console.log(`[API] Query params:`, req.query);
    console.log(`========================================\n`);
    
    try {
      const since = req.query.since as string;
      const until = req.query.until as string;

      if (!since || !until) {
        console.log('[API] ❌ Bad request: missing since or until');
        res.status(400).json({ 
          success: false, 
          error: 'since and until are required (YYYY-MM-DD)' 
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(since) || !dateRegex.test(until)) {
        console.log('[API] ❌ Bad request: invalid date format');
        res.status(400).json({ 
          success: false, 
          error: 'Dates must be in YYYY-MM-DD format' 
        });
        return;
      }

      const data = await getEnrichedAds({ since, until });

      console.log(`\n[API] ✅ Returning ${data.length} enriched records\n`);
      res.status(200).json({ 
        success: true, 
        data,
        count: data.length
      });
    } catch (err: any) {
      console.error('\n[API] ❌ Error in /api/v1/facebook/enriched-ads:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
      });
    }
  }
}
