// facebookAds.routes.ts
import express from 'express';
import { FacebookAdsController } from '../controllers/facebookAds.controller.js';

const router = express.Router();
const facebookAdsController = new FacebookAdsController();

/**
 * GET /api/v1/facebook/enriched-ads
 * Get enriched Facebook ads data with insights, creatives, and lead forms
 * Query params: since (YYYY-MM-DD), until (YYYY-MM-DD)
 */
router.get('/enriched-ads', (req, res) => facebookAdsController.getEnrichedAds(req, res));

export default router;
