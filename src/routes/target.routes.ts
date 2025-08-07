import { Router } from 'express';
import { TargetController } from '../controllers/targetController.js';

const router = Router();
const controller = new TargetController();

// Create or update target
router.post('/upsert', controller.upsertTarget);

// Get targets by period (weekly/monthly/yearly)
router.get('/get', controller.getTargets);

export default router;