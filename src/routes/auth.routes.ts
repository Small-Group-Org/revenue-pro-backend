import express, { Router } from "express";
import authController from "../controllers/auth.controller.js";

const router: Router = express.Router();

router.get("/google", authController.googleAuth);
router.post("/login", authController.login);
router.post("/register", authController.register);
router.post("/verify-token", authController.verifyToken);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

export default router;
