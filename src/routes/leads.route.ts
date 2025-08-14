import express from "express";
import { LeadController } from "../controllers/leadController.js";

const router = express.Router();
const leadController = new LeadController();

router.get("/", (req, res) => leadController.getLeads(req, res));
router.patch("/", (req, res) => leadController.updateLead(req, res));
router.get("/conversion-rates", (req, res) =>
  leadController.getConversionRates(req, res)
);
router.post("/conversion-rates", (req, res) =>
  leadController.conditionalUpsertConversionRates(req, res)
);

// Weekly conversion rate update endpoints
router.post("/weekly-update/trigger", (req, res) => leadController.triggerWeeklyConversionRateUpdate(req, res));
router.get("/weekly-update/status", (req, res) => leadController.getWeeklyUpdateStatus(req, res));

export default router;
