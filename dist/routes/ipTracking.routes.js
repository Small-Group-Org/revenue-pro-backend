import { Router } from "express";
import IPTrackingController from "../controllers/ipTracking.controller.js";
import di from "../di/di.js";
const router = Router();
const ipTrackingController = new IPTrackingController(di.IPTrackingService());
router.put("/track", (req, res) => {
    ipTrackingController.trackActivity(req, res);
});
router.get("/user/:userId", (req, res) => {
    ipTrackingController.getUserActivity(req, res);
});
export { router as ipTrackingRoutes };
