import { Router } from "express";
import { LeadController } from "../controllers/leadController.js";
import { verifyApiKey } from "../middlewares/apiKey.middleware.js";

const router = Router();
const controller = new LeadController();

// Route to create single or bulk leads (protected by static API key)
router.post("/hooks/create-lead", verifyApiKey, controller.createLead);
router.post('/trigger-leads-computation',verifyApiKey, controller.updateConversionRatesAndLeadScores);

export default router

