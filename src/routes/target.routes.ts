import { Router } from 'express';
import { TargetController } from '@/controllers/targetController.js';

const router = Router();
const targetController = new TargetController();

router.post("/:year", targetController.update);

export default router;