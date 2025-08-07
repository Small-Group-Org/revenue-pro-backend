import { Router } from "express";
import { LeadController } from "../controllers/leadController.js";
import { verifyApiKey } from "../middlewares/apiKey.middleware.js";

const router = Router();
const controller = new LeadController();

// Route to create single or bulk leads (protected by static API key)
export default router.post("/", verifyApiKey, controller.createLead);

