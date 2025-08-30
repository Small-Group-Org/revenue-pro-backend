import { LeadController } from "../controllers/leadController.js";
import { Router } from "express";
import { verifyApiKey } from "../middlewares/apiKey.middleware.js";

const router = Router();
const controller = new LeadController();

router.post("/", verifyApiKey, controller.processSheetLeads);

export default router;
