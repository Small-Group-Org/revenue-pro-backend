import express from "express";
import { LeadController } from "../controllers/leadController.js";
import { ActualController } from '../controllers/actualController.js';
const router = express.Router();
const leadController = new LeadController();
const actualController = new ActualController();
// HubSpot subscription webhook - no authentication required
router.post("/hubspot-subscription", (req, res) => leadController.hubspotSubscription(req, res));
router.get("/get-disengaged-clients", (req, res) => leadController.syncClientActivity(req, res));
router.patch("/update-actual", (req, res) => actualController.updateWeeklyReporting(req, res));
export default router;
