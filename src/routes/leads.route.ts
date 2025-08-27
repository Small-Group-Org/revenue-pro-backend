import express from "express";
import { LeadController } from "../controllers/leadController.js";
import { 
  FIELD_WEIGHTS, 
  getMonthlyName, 
  isValidMonthName,
  type LeadKeyField 
} from "../services/leads/utils/leads.util.js";

const router = express.Router();
const leadController = new LeadController();

// Utility functions available for route handlers
export { FIELD_WEIGHTS, getMonthlyName, isValidMonthName, type LeadKeyField };

router.get("/", (req, res) => leadController.getLeads(req, res));
router.patch("/", (req, res) => leadController.updateLead(req, res));
router.get("/conversion-rates", (req, res) =>
  leadController.getConversionRates(req, res)
);

export default router;
