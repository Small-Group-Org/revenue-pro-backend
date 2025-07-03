import { Router } from 'express';
import { ReportController } from '../controllers/reportController.js';
import { ReportService } from '../services/reports/service/service.js';

const router = Router();
const reportService = new ReportService();
const reportController = new ReportController(reportService);

router.get("/", reportController.get);

export default router;
