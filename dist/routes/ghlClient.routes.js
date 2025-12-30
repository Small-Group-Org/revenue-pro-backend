import { Router } from "express";
import ghlClientController from "../controllers/ghlClient.controller.js";
import { isAdmin } from "../middlewares/auth.middleware.js";
const router = Router();
// GHL Client configuration routes
router.post("/", isAdmin, ghlClientController.createGhlClient);
router.get("/", isAdmin, ghlClientController.getAllGhlClients);
router.get("/:locationId", isAdmin, ghlClientController.getGhlClientById);
router.put("/:locationId", isAdmin, ghlClientController.updateGhlClient);
export default router;
