// facebookAds.routes.ts
import express from 'express';
import { FacebookAdsController } from '../controllers/facebookAds.controller.js';

const router = express.Router();
const facebookAdsController = new FacebookAdsController();

/**
 * GET /api/v1/facebook/enriched-ads
 * Get enriched Facebook ads data with insights, creatives, and lead forms
 * Query params: clientId, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), queryType
 */
router.get('/enriched-ads', (req, res) => facebookAdsController.getEnrichedAds(req, res));

/**
 * GET /api/v1/facebook/ad-accounts
 * Get all ad accounts (owned + client) from Business Manager
 */
router.get('/ad-accounts', (req, res) => facebookAdsController.getAdAccounts(req, res));

/**
 * GET /api/v1/facebook/my-businesses
 * Get all businesses for the logged-in user (via /me/businesses)
 */
router.get('/my-businesses', (req, res) => facebookAdsController.getMyBusinesses(req, res));

/**
 * POST /api/v1/facebook/ad-performance-board
 * Get ad performance board with flexible columns and filters
 * Query params: clientId
 * Body: { groupBy, filters, columns }
 */
router.post('/ad-performance-board', (req, res) => facebookAdsController.getAdPerformanceBoard(req, res));

/**
 * POST /api/v1/facebook/save-weekly-analytics
 * Save weekly Facebook analytics to database
 * Query params: clientId, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.post('/save-weekly-analytics', (req, res) => facebookAdsController.saveWeeklyAnalytics(req, res));

/**
 * GET /api/v1/facebook/saved-analytics
 * Get saved weekly analytics from database
 * Query params: clientId, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get('/saved-analytics', (req, res) => facebookAdsController.getSavedAnalytics(req, res));

export default router;
