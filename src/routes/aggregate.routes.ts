import { Router } from 'express';
import { AggregateController } from '../controllers/aggregate.controller.js';

const router = Router();
const aggregateController = new AggregateController();

router.get('/report', aggregateController.getAggregatedReport);

export default router;
