import express from "express";
import { LeadController } from "../controllers/leadController.js";
const router = express.Router();
const leadController = new LeadController();

//To be removed once FE is using paginated route
router.get("/", (req, res) => leadController.getLeads(req, res));
router.get("/paginated", (req, res) => leadController.getLeadsPaginated(req, res));
router.get("/filters-and-counts", (req, res) => leadController.getLeadFiltersAndCounts(req, res));
router.patch("/", (req, res) => leadController.updateLead(req, res));
router.get("/conversion-rates", (req, res) =>
  leadController.getConversionRates(req, res)
);
router.get("/analytics/summary",(req, res)=> leadController.getAnalytics(req, res))
router.get("/analytics/ad-table",(req, res)=> leadController.getAnalyticsTable(req, res))

export default router;
