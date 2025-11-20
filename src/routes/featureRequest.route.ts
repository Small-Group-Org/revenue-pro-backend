import { Router } from 'express';
import { FeatureRequestController } from '../controllers/featureRequestController.js';

const router = Router();
const controller = new FeatureRequestController();

// Create feature request
router.post('/', controller.createFeatureRequest.bind(controller));

export default router;