import { Router } from 'express';
import { testDummyEndpoint, testMultiOpportunitySyncEndpoint } from '../controllers/dummy.controller.js';
const router = Router();
// Dummy endpoint for testing cron job
router.get('/test-endpoint', testDummyEndpoint);
// Dummy endpoint for testing multi-opportunity sync cron
router.get('/multi-opportunity-sync-test', testMultiOpportunitySyncEndpoint);
export default router;
