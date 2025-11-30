import express, { Router } from "express";
import metaOAuthController from "../controllers/metaOAuth.controller.js";

const router: Router = express.Router();

// Meta OAuth callback endpoint
// Note: This is a GET endpoint because OAuth callbacks are GET requests
// The endpoint does not use verifyTokenMiddleware because it needs to handle
// the OAuth callback flow, but it verifies the user token manually in the controller
// Support both with and without trailing slash for flexibility
router.get("/generate-meta-access-token", metaOAuthController.generateMetaAccessToken);
router.get("/generate-meta-access-token/", metaOAuthController.generateMetaAccessToken);

export default router;

