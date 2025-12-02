// facebookAds.controller.ts
import { Request, Response } from 'express';
import { getEnrichedAds } from '../services/facebook/enrichedAdsService.js';
import { getAllAdAccounts } from '../services/facebook/fbAdAccountsService.js';
import { fbGet } from '../services/facebook/fbClient.js';
import UserService from '../services/user/service/service.js';

export class FacebookAdsController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();

    this.getEnrichedAds = this.getEnrichedAds.bind(this);
    this.getAdAccounts = this.getAdAccounts.bind(this);
    this.getMyBusinesses = this.getMyBusinesses.bind(this);
  }

  /**
   * Get enriched Facebook ads data with insights, creatives, and lead forms
   * GET /api/v1/facebook/enriched-ads?clientId=XXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&queryType=monthly
   *
   * From clientId:
   * - Read user's fbAdAccountId (numeric or act_XXXXX)
   * - Use hardcoded Meta token owner client (68ac6ebce46631727500499b) for metaAccessToken
   */
  async getEnrichedAds(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] Request received: GET /api/v1/facebook/enriched-ads`);
    console.log(`[API] Query params:`, req.query);
    console.log(`========================================\n`);

    try {
      const clientId = req.query.clientId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const queryType = req.query.queryType as string;

      if (!clientId || !startDate || !endDate || !queryType) {
        console.log('[API] Bad request: missing required parameters');
        res.status(400).json({
          success: false,
          error: 'clientId, startDate, endDate, and queryType are required',
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        console.log('[API] Bad request: invalid date format');
        res.status(400).json({
          success: false,
          error: 'Dates must be in YYYY-MM-DD format',
        });
        return;
      }

      // Validate queryType
      const validQueryTypes: Array<'weekly' | 'monthly' | 'yearly'> = ['weekly', 'monthly', 'yearly'];
      if (!validQueryTypes.includes(queryType as any)) {
        console.log('[API] Bad request: invalid queryType');
        res.status(400).json({
          success: false,
          error: 'queryType must be one of: weekly, monthly, yearly',
        });
        return;
      }

      // 1) Get client user to resolve fbAdAccountId
      const clientUser = await this.userService.getUserById(clientId);
      if (!clientUser) {
        console.log('[API] Client user not found for clientId:', clientId);
        res.status(404).json({
          success: false,
          error: 'Client user not found',
        });
        return;
      }

      const rawAdAccountId = (clientUser as any).fbAdAccountId as string | undefined;
      if (!rawAdAccountId) {
        console.log('[API] Client user missing fbAdAccountId');
        res.status(400).json({
          success: false,
          error: 'Client does not have a configured Facebook Ad Account ID',
        });
        return;
      }

      // Validate ad account format (numeric or act_XXXXX)
      if (!/^(act_)?\d+$/.test(rawAdAccountId)) {
        console.log('[API] Bad request: invalid fbAdAccountId format on client user');
        res.status(400).json({
          success: false,
          error: 'Stored fbAdAccountId must be numeric or in format act_XXXXX',
        });
        return;
      }

      const formattedAdAccountId = rawAdAccountId.startsWith('act_')
        ? rawAdAccountId
        : `act_${rawAdAccountId}`;

      // 2) Get Meta access token from hardcoded client
      const metaTokenClientId = '68ac6ebce46631727500499b';
      const metaTokenUser = await this.userService.getUserById(metaTokenClientId);

      const accessToken = (metaTokenUser as any)?.metaAccessToken as string | undefined;
      if (!accessToken) {
        console.log('[API] Meta access token not configured for hardcoded client:', metaTokenClientId);
        res.status(500).json({
          success: false,
          error: 'Meta access token not configured for enrichment',
        });
        return;
      }

      const data = await getEnrichedAds({
        adAccountId: formattedAdAccountId,
        startDate,
        endDate,
        queryType: queryType as 'weekly' | 'monthly' | 'yearly',
        accessToken,
      });

      console.log(`\n[API] Returning ${Array.isArray(data) ? data.length : 1} enriched records\n`);
      res.status(200).json({
        success: true,
        data,
        count: Array.isArray(data) ? data.length : 1,
      });
    } catch (err: any) {
      console.error('\n[API] Error in /api/v1/facebook/enriched-ads:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message,
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
      // Use the same hardcoded Meta token owner as enriched-ads
      const metaTokenClientId = '68ac6ebce46631727500499b';
      const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
      const accessToken = (metaTokenUser as any)?.metaAccessToken as string | undefined;

      if (!accessToken) {
        
        res.status(500).json({
          success: false,
          error: 'Meta access token not configured for ad accounts fetch',
        });
        return;
      }

      const data = await getAllAdAccounts(accessToken);

      res.status(200).json({ 
        success: true, 
        data: data.adAccounts,
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

  /**
   * Get businesses for the current user from Meta
   * GET /api/v1/facebook/my-businesses
   */
  async getMyBusinesses(req: Request, res: Response): Promise<void> {
    console.log(`\n========================================`);
    console.log(`[API] Request received: GET /api/v1/facebook/my-businesses`);
    console.log(`========================================\n`);
    
    try {
      const user = req.context.getUser();
      const accessToken = user?.metaAccessToken;

      if (!accessToken) {
        console.log('[API] Forbidden: Meta access token not connected for user');
        res.status(403).json({
          success: false,
          error: 'Meta account not connected. Please connect your Meta account in profile settings.',
        });
        return;
      }

      // Call Meta Graph API: /me/businesses
      const params = {
        limit: 100,
      };

      const result = await fbGet('/me/businesses', params, accessToken);

      console.log(`[API] /me/businesses response keys:`, Object.keys(result || {}));

      res.status(200).json({
        success: true,
        data: result?.data || [],
      });
    } catch (err: any) {
      console.error('\n[API] Error in /api/v1/facebook/my-businesses:', err.message);
      console.error('[API] Stack:', err.stack);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message,
      });
    }
  }
}
