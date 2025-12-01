// facebookAds.controller.ts
import { Request, Response } from 'express';
import { getEnrichedAds } from '../services/facebook/enrichedAdsService.js';
import { getAllAdAccounts } from '../services/facebook/fbAdAccountsService.js';

export class FacebookAdsController {
  constructor() {
    this.getEnrichedAds = this.getEnrichedAds.bind(this);
    this.getAdAccounts = this.getAdAccounts.bind(this);
  }

  /**
   * Get enriched Facebook ads data with insights, creatives, and lead forms
   * GET /api/v1/facebook/enriched-ads?adAccountId=XXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&queryType=monthly
   * 
   * For queryType="monthly": Returns array of weekly spend data (5 weeks per month)
   * For queryType="weekly": Returns single week data
   */
  async getEnrichedAds(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] Request received: GET /api/v1/facebook/enriched-ads`);
    console.log(`[API] Query params:`, req.query);
    console.log(`========================================\n`);
    
    try {
      const adAccountId = req.query.adAccountId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const queryType = req.query.queryType as string;

      if (!adAccountId || !startDate || !endDate || !queryType) {
        console.log('[API] Bad request: missing required parameters');
        res.status(400).json({ 
          success: false, 
          error: 'adAccountId, startDate, endDate, and queryType are required' 
        });
        return;
      }

      // Validate adAccountId format (numeric or act_XXXXX)
      if (!/^(act_)?\d+$/.test(adAccountId)) {
        console.log('[API] Bad request: invalid adAccountId format');
        res.status(400).json({ 
          success: false, 
          error: 'adAccountId must be numeric or in format act_XXXXX' 
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        console.log('[API] Bad request: invalid date format');
        res.status(400).json({ 
          success: false, 
          error: 'Dates must be in YYYY-MM-DD format' 
        });
        return;
      }

      // Validate queryType
      const validQueryTypes = ['weekly', 'monthly', 'yearly'];
      if (!validQueryTypes.includes(queryType)) {
        console.log('[API] Bad request: invalid queryType');
        res.status(400).json({ 
          success: false, 
          error: 'queryType must be one of: weekly, monthly, yearly' 
        });
        return;
      }

      // Ensure adAccountId has act_ prefix
      const formattedAdAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

      const data = await getEnrichedAds({ 
        adAccountId: formattedAdAccountId, 
        startDate, 
        endDate,
        queryType: queryType as 'weekly' | 'monthly' | 'yearly'
      });

      console.log(`\n[API] Returning ${Array.isArray(data) ? data.length : 1} enriched records\n`);
      res.status(200).json({ 
        success: true, 
        data,
        count: Array.isArray(data) ? data.length : 1
      });
    } catch (err: any) {
      console.error('\n[API] Error in /api/v1/facebook/enriched-ads:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
      });
    }
  }

  /**
   * Get all ad accounts from Business Manager (owned + client)
   * GET /api/v1/facebook/ad-accounts?businessId=XXXXX
   */
  async getAdAccounts(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] Request received: GET /api/v1/facebook/ad-accounts`);
    console.log(`[API] Query params:`, req.query);
    console.log(`========================================\n`);
    
    try {
      const businessId = req.query.businessId as string;

      if (!businessId) {
        console.log('[API] Bad request: missing businessId');
        res.status(400).json({ 
          success: false, 
          error: 'businessId is required as query parameter' 
        });
        return;
      }

      // Validate businessId format (should be numeric)
      if (!/^\d+$/.test(businessId)) {
        console.log('[API] Bad request: invalid businessId format');
        res.status(400).json({ 
          success: false, 
          error: 'businessId must be numeric' 
        });
        return;
      }

      const data = await getAllAdAccounts(businessId);

      console.log(`\n[API] Returning ${data.total} ad accounts\n`);
      res.status(200).json({ 
        success: true, 
        data: {
          owned: data.owned,
          client: data.client,
          total: data.total,
        }
      });
    } catch (err: any) {
      console.error('\n[API] Error in /api/v1/facebook/ad-accounts:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
      });
    }
  }
}
