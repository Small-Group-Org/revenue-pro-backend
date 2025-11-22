import { Router } from "express";
import {  isAdmin } from "../middlewares/auth.middleware.js";
import adminController from "../controllers/admin.controller.js";

const router = Router();

// Admin user management routes
router.post("/users/upsert",  isAdmin, adminController.upsertUser);
router.get("/users/list/all", isAdmin, adminController.getAllUsers);
router.get("/get/users/:userId", isAdmin, adminController.getUserById);
router.delete("/users/:userId", isAdmin, adminController.deleteUser);

// Cron job trigger routes
router.post("/opportunity-sync/trigger", isAdmin, adminController.triggerOpportunitySync);
router.post("/multi-client-opportunity-sync/trigger", isAdmin, adminController.triggerMultiClientOpportunitySync);
router.post("/lead-sheets-sync/trigger", isAdmin, adminController.triggerLeadSheetsSync);


export default router; 