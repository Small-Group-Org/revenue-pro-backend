import express from "express";
import metaOAuthController from "../controllers/metaOAuth.controller.js";
const router = express.Router();
// Meta OAuth callback endpoint
// Note: This is a GET endpoint because OAuth callbacks are GET requests
// No authentication required - updates hardcoded client ID (683acb7561f26ee98f5d2d51)
// Support both with and without trailing slash for flexibility
router.get("/generate-meta-access-token", metaOAuthController.generateMetaAccessToken);
router.get("/generate-meta-access-token/", metaOAuthController.generateMetaAccessToken);
export default router;
