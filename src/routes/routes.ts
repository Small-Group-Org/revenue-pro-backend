import { Express, Request, Response, NextFunction, RequestHandler, Router } from "express";
import authRouter from "./auth.routes.js"
import reportRouter from "./report.routes.js"
import targetRouter from "./target.routes.js"
import adminRouter from "./admin.routes.js"
import userRoutes from "./user.routes.js"
import leadRouter from "./leads.route.js";
import createLeadRouter from "./createLead.route.js"
import sheetRouter from "./sheet.routes.js"
import { ipTrackingRoutes } from "./ipTracking.routes.js"
import cronLogsRouter from "./cronLogs.routes.js"
import webhooksRouter from "./webhooks.routes.js"
import ticketRouter from "./tickets.routes.js"
import ghlClientRouter from "./ghlClient.routes.js"
import aggregateRouter from "./aggregate.routes.js"
import featureRequestRoutes from './featureRequest.route.js';
import facebookAdsRouter from './facebookAds.routes.js';
import metaOAuthRouter from "./metaOAuth.routes.js";


import {
  addContext,
} from "../middlewares/common.middleware.js";
import { verifyTokenMiddleware } from "../middlewares/auth.middleware.js";

interface Route {
  path: string;
  middlewares?: RequestHandler[];
  router: Router;
}

// Routes that require JWT authentication
const authenticatedRoutes: Route[] = [
  { path: "/api/v1/actual", router: reportRouter },
  { path: "/api/v1/report", router: reportRouter },
  { path: "/api/v1/targets", router: targetRouter },
  { path: "/api/v1/admin", router: adminRouter },
  { path: "/api/v1/users", router: userRoutes },
  { path: "/api/v1/leads", router: leadRouter },
  { path: "/api/v1/ip-tracking", router: ipTrackingRoutes },
  { path: "/api/v1/tickets", router: ticketRouter },
  { path: "/api/v1/ghl-clients", router: ghlClientRouter },
  { path: "/api/v1/aggregate", router: aggregateRouter },
  { path: "/api/v1/feature-requests", router: featureRequestRoutes },
  { path: "/api/v1/facebook", router: facebookAdsRouter }
];

// Public routes or Protected by api key
const otherRoutes: Route[] = [
  { path: "/api/v1/auth", router: authRouter },
  { path: "/api/v1", router: createLeadRouter },
  // Feature deprecated
  // { path: "/api/v1/process-lead-sheet", router: sheetRouter },
  { path: "/api/v1/cron-logs", router: cronLogsRouter },
  { path: "/api/v1/webhooks", router: webhooksRouter },
  { path: "/api/v1", router: metaOAuthRouter }, // Meta OAuth callback (handles auth manually)
];

const configureRoutes = (app: Express): void => {
  // add health route
  app.use("/health", [], (req: Request, res: Response) => {
    res.status(200).json({ message: "I am healthy" });
  });

  // Add this before your routes
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      console.error('JSON Parsing Error:', err.message);
      console.error('Request body:', req.body);
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format',
        message: 'The request body contains invalid JSON. Please check your JSON syntax.',
        details: err.message
      });
    }
    next(err);
  });

  // Helper function to register routes with consistent middleware application
  const registerRoutes = (routes: Route[], requiresAuth: boolean = false) => {
    routes.forEach((route) => {
      const middlewares = [addContext];
      
      if (requiresAuth) {
        middlewares.push(verifyTokenMiddleware);
      }
      
      // Add any additional route-specific middlewares
      if (route.middlewares) {
        middlewares.push(...route.middlewares);
      }
      
      app.use(route.path, ...middlewares, route.router);
    });
  };

  registerRoutes(authenticatedRoutes, true);
  
  registerRoutes(otherRoutes, false);
};

export default configureRoutes;
