import { Router } from 'express';
import { FeatureRequestController } from '../controllers/featureRequestController.js';
const router = Router();
const controller = new FeatureRequestController();
// Create feature request
router.post('/', controller.createFeatureRequest.bind(controller));
// Get all feature requests (Admin) or user's own (User)
router.get('/', controller.getFeatureRequests.bind(controller));
// Update feature request (Admin only)
router.put('/:id', controller.updateFeatureRequest.bind(controller));
export default router;
