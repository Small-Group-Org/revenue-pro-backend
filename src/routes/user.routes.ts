import { Router } from "express";
import userController from "../controllers/user.controller.js";

const router = Router();

// User profile routes
router.get("/get/:id/", userController.getProfile);
router.put("/update", userController.updateProfile);

export default router;
