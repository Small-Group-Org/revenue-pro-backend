import { LeadController } from "../controllers/leadController.js";
import { Router } from "express";

const router = Router();
const controller = new LeadController();

router.post("/", controller.fetchSheetAndUpdateConversion);

export default router;
