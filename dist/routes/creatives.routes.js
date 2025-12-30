import { Router } from 'express';
import { CreativesController } from '../controllers/creatives.controller.js';
const router = Router();
const creativesController = new CreativesController();
/**
 * POST /api/v1/creatives/fetch-and-save
 * Fetch and save creatives for all ads in a date range
 */
router.post('/fetch-and-save', creativesController.fetchAndSaveCreatives);
/**
 * GET /api/v1/creatives/:creativeId
 * Get a single creative by ID
 */
router.get('/:creativeId', creativesController.getCreative);
/**
 * GET /api/v1/creatives
 * Get all creatives for an ad account
 */
router.get('/', creativesController.getCreativesByAccount);
export default router;
