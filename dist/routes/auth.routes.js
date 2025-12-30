import express from "express";
import authController from "../controllers/auth.controller.js";
const router = express.Router();
router.post("/login", authController.login);
router.post("/register", authController.register);
router.post("/verify-token", authController.verifyToken);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
export default router;
