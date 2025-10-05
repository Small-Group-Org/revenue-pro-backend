import express from "express";
import { LeadController } from "../controllers/leadController.js";
const router = express.Router();
const leadController = new LeadController();

router.get("/paginated", (req, res) => leadController.getLeadsPaginated(req, res));
router.get("/filters-and-counts", (req, res) => leadController.getLeadFiltersAndCounts(req, res));
router.patch("/", (req, res) => leadController.updateLead(req, res));
router.delete("/", (req, res) => leadController.deleteLead(req, res));
router.get("/conversion-rates", (req, res) =>
  leadController.getConversionRates(req, res)
);
router.get("/analytics/summary",(req, res)=> leadController.getAnalytics(req, res))
router.get("/analytics/ad-table",(req, res)=> leadController.getAnalyticsTable(req, res))
router.post("/hubspot-subscription",(req, res)=> leadController.hubspotSubscription(req, res))

export default router;
