import { Router } from 'express';
import { ActualController } from '../controllers/actualController.js';
import { ActualService } from '../services/actual/service/service.js';

const router = Router();
const actualService = new ActualService();
const actualController = new ActualController(actualService);

router.post("/:year/:week", actualController.upsert);

export default router;
