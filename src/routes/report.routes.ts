import { Router } from 'express';
import { ActualController } from '../controllers/actualController.js';

const router = Router();
const controller = new ActualController();

// Upsert actual data for a week
router.post('/upsert', controller.upsertActual);

// Get actuals by period (weekly/monthly/yearly)
router.get('/get', controller.getActualAndTargetReport);

export default router;