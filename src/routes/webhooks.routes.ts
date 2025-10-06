import express from "express";
import { LeadController } from "../controllers/leadController.js";

const router = express.Router();
const leadController = new LeadController();

// HubSpot subscription webhook - no authentication required
router.post("/hubspot-subscription", (req, res) => leadController.hubspotSubscription(req, res));

export default router;
