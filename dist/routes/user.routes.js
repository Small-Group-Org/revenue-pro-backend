import { Router } from "express";
import userController from "../controllers/user.controller.js";
const router = Router();
// User profile routes
router.get("/get/:id/", userController.getProfile);
router.put("/update", userController.updateProfile);
router.put("/update-password", userController.updatePassword);
router.put('/last-access', userController.updateLastAccess);
router.put('/mark-update-seen', userController.markUpdateAsSeen);
router.put('/fb-ad-account/:clientId', userController.updateFbAdAccountId);
export default router;
