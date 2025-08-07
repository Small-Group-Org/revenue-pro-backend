import express from "express";
import { LeadController } from "../controllers/leadController.js";

const router = express.Router();
const leadController = new LeadController();

router.get("/", (req, res) => leadController.getLeads(req, res));
router.patch("/", (req, res) => leadController.updateLead(req, res));

export default router;
