import { getEnrichedAds } from '../services/facebook/enrichedAdsService.js';
import { getAllAdAccounts } from '../services/facebook/fbAdAccountsService.js';
import { fbGet } from '../services/facebook/fbClient.js';
import { getAdPerformanceBoard } from '../services/facebook/adPerformanceBoard.service.js';
import { saveWeeklyAnalyticsToDb, getSavedWeeklyAnalytics } from '../services/facebook/saveWeeklyAnalytics.service.js';
import UserService from '../services/user/service/service.js';
import { config } from '../config.js';
export class FacebookAdsController {
    constructor() {
        this.userService = new UserService();
        this.getEnrichedAds = this.getEnrichedAds.bind(this);
        this.getAdAccounts = this.getAdAccounts.bind(this);
        this.getMyBusinesses = this.getMyBusinesses.bind(this);
        this.getAdPerformanceBoard = this.getAdPerformanceBoard.bind(this);
        this.saveWeeklyAnalytics = this.saveWeeklyAnalytics.bind(this);
        this.getSavedAnalytics = this.getSavedAnalytics.bind(this);
    }
    /**
     * Get enriched Facebook ads data with insights, creatives, and lead forms
     * GET /api/v1/facebook/enriched-ads?clientId=XXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&queryType=monthly
     *
     * From clientId:
     * - Read user's fbAdAccountId (numeric or act_XXXXX)
     * - Use hardcoded Meta token owner client (68ac6ebce46631727500499b) for metaAccessToken
     */
    async getEnrichedAds(req, res) {
        try {
            const clientId = req.query.clientId;
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const queryType = req.query.queryType;
            if (!clientId || !startDate || !endDate || !queryType) {
                res.status(400).json({
                    success: false,
                    error: 'clientId, startDate, endDate, and queryType are required',
                });
                return;
            }
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
                res.status(400).json({
                    success: false,
                    error: 'Dates must be in YYYY-MM-DD format',
                });
                return;
            }
            // Validate queryType
            const validQueryTypes = ['weekly', 'monthly', 'yearly'];
            if (!validQueryTypes.includes(queryType)) {
                res.status(400).json({
                    success: false,
                    error: 'queryType must be one of: weekly, monthly, yearly',
                });
                return;
            }
            // 1) Get client user to resolve fbAdAccountId
            const clientUser = await this.userService.getUserById(clientId);
            if (!clientUser) {
                res.status(404).json({
                    success: false,
                    error: 'Client user not found',
                });
                return;
            }
            const rawAdAccountId = clientUser.fbAdAccountId;
            if (!rawAdAccountId) {
                res.status(400).json({
                    success: false,
                    error: 'Client does not have a configured Facebook Ad Account ID',
                });
                return;
            }
            // Validate ad account format (numeric or act_XXXXX)
            if (!/^(act_)?\d+$/.test(rawAdAccountId)) {
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
            const metaTokenClientId = config.META_USER_TOKEN_ID;
            const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
            const accessToken = metaTokenUser?.metaAccessToken;
            if (!accessToken) {
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
                queryType: queryType,
                accessToken,
            });
            res.status(200).json({
                success: true,
                data,
                count: Array.isArray(data) ? data.length : 1,
            });
        }
        catch (err) {
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
    async getAdAccounts(req, res) {
        try {
            // Use the same hardcoded Meta token owner as enriched-ads
            const metaTokenClientId = config.META_USER_TOKEN_ID;
            const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
            const accessToken = metaTokenUser?.metaAccessToken;
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
        }
        catch (err) {
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
    async getMyBusinesses(req, res) {
        try {
            const user = req.context.getUser();
            const accessToken = user?.metaAccessToken;
            if (!accessToken) {
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
            res.status(200).json({
                success: true,
                data: result?.data || [],
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: err.message,
            });
        }
    }
    /**
     * Get ad performance board with flexible columns and filters
     * POST /api/v1/facebook/ad-performance-board?clientId=XXX
     * Body: { groupBy, filters, columns }
     */
    async getAdPerformanceBoard(req, res) {
        try {
            // 1️ Extract parameters
            const { clientId } = req.query; // "683acb7561f26ee98f5d2d51"
            const { filters, columns, groupBy } = req.body;
            // 2️ Validate clientId
            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required parameter: clientId',
                });
                return;
            }
            // 3️ Validate filters (must have startDate & endDate)
            if (!filters || !filters.startDate || !filters.endDate) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required filters: startDate and endDate',
                });
                return;
            }
            // 4️ Validate columns (at least one column requested)
            if (!columns || Object.keys(columns).length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'At least one column must be requested',
                });
                return;
            }
            // 5️ Validate groupBy
            if (!groupBy || !['campaign', 'adset', 'ad'].includes(groupBy)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid groupBy value. Must be: campaign, adset, or ad',
                });
                return;
            }
            // 6️ Validate date format (YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(filters.startDate) || !dateRegex.test(filters.endDate)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid date format. Use YYYY-MM-DD',
                });
                return;
            }
            // 7️ Call service layer
            const params = {
                clientId: clientId,
                filters,
                columns,
                groupBy,
            };
            const result = await getAdPerformanceBoard(params);
            // 8️ Return success response
            console.log(`[API] Returning ${result.rows.length} board rows`);
            res.status(200).json({
                success: true,
                data: result.rows,
                availableZipCodes: result.availableZipCodes,
                availableServiceTypes: result.availableServiceTypes,
                meta: {
                    totalRows: result.rows.length,
                    groupBy,
                    filters,
                    columns,
                },
            });
        }
        catch (error) {
            // 9️⃣ Error handling
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch ad performance board data',
            });
        }
    }
    /**
     * Save weekly analytics to database
     * POST /api/v1/facebook/save-weekly-analytics?clientId=XXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
     */
    async saveWeeklyAnalytics(req, res) {
        try {
            const clientId = req.query.clientId;
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            // 1️ Validate required parameters
            if (!clientId || !startDate || !endDate) {
                res.status(400).json({
                    success: false,
                    error: 'clientId, startDate, and endDate are required',
                });
                return;
            }
            // 2️ Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
                res.status(400).json({
                    success: false,
                    error: 'Dates must be in YYYY-MM-DD format',
                });
                return;
            }
            // 3️ Get client user to resolve fbAdAccountId
            const clientUser = await this.userService.getUserById(clientId);
            if (!clientUser) {
                res.status(404).json({
                    success: false,
                    error: 'Client user not found',
                });
                return;
            }
            const rawAdAccountId = clientUser.fbAdAccountId;
            if (!rawAdAccountId) {
                res.status(400).json({
                    success: false,
                    error: 'Client does not have a configured Facebook Ad Account ID',
                });
                return;
            }
            const formattedAdAccountId = rawAdAccountId.startsWith('act_')
                ? rawAdAccountId
                : `act_${rawAdAccountId}`;
            // 4️ Get Meta access token from hardcoded client
            const metaTokenClientId = '68ac6ebce46631727500499b';
            const metaTokenUser = await this.userService.getUserById(metaTokenClientId);
            const accessToken = metaTokenUser?.metaAccessToken;
            if (!accessToken) {
                res.status(500).json({
                    success: false,
                    error: 'Meta access token not configured',
                });
                return;
            }
            // 5️ Call service to save analytics (split into weekly chunks)
            const result = await saveWeeklyAnalyticsToDb({
                clientId,
                adAccountId: formattedAdAccountId,
                startDate,
                endDate,
                accessToken,
            });
            res.status(200).json({
                success: true,
                message: 'Weekly analytics saved successfully',
                data: {
                    totalRecordsSaved: result.savedCount,
                    weeksProcessed: result.weeksSaved,
                    dateRange: result.dateRange,
                    hasErrors: result.errors.length > 0,
                    errors: result.errors
                },
            });
        }
        catch (err) {
            console.error('\n[API] Error in /api/v1/facebook/save-weekly-analytics:', err.message);
            console.error('[API] Stack:', err.stack);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: err.message,
            });
        }
    }
    /**
     * Get saved weekly analytics from database
     * GET /api/v1/facebook/saved-analytics?clientId=XXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
     */
    async getSavedAnalytics(req, res) {
        try {
            const clientId = req.query.clientId;
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            // 1️ Validate required parameters
            if (!clientId || !startDate || !endDate) {
                res.status(400).json({
                    success: false,
                    error: 'clientId, startDate, and endDate are required',
                });
                return;
            }
            // 2️ Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
                res.status(400).json({
                    success: false,
                    error: 'Dates must be in YYYY-MM-DD format',
                });
                return;
            }
            // 3️ Call service to retrieve analytics
            const data = await getSavedWeeklyAnalytics({
                clientId,
                startDate,
                endDate
            });
            res.status(200).json({
                success: true,
                data,
                count: data.length,
                summary: {
                    totalRecords: data.length,
                    dateRange: {
                        start: startDate,
                        end: endDate
                    }
                }
            });
        }
        catch (err) {
            console.error('[API] Stack:', err.stack);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: err.message,
            });
        }
    }
}
