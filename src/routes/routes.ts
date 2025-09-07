import { Express, Request, Response, NextFunction } from "express";
import authRouter from "./auth.routes.js"
import actualRouter from "./report.routes.js"
import reportRouter from "./report.routes.js"
import targetRouter from "./target.routes.js"
import adminRouter from "./admin.routes.js"
import userRoutes from "./user.routes.js"
import leadRouter from "./leads.route.js";
import createLeadRouter from "./createLead.route.js"
import sheetRouter from "./sheet.routes.js"
import { ipTrackingRoutes } from "./ipTracking.routes.js"
import cronLogsRouter from "./cronLogs.routes.js"


import {
  addContext,
} from "../middlewares/common.middleware.js";
import { verifyTokenMiddleware } from "../middlewares/auth.middleware.js";

interface Route {
  path: string;
  middlewares?: any[];
  router: any;
}

const authenticatedRoutes: Route[] = [
  {
    path: "/api/v1/actual",
    router: actualRouter,
    middlewares: [],
  },
  {
    path: "/api/v1/report",
    router: reportRouter,
    middlewares: [],
  },
  {
    path: "/api/v1/targets",
    router: targetRouter,
    middlewares: [],
  },
  {
    path: "/api/v1/admin",
    router: adminRouter,
    middlewares: [],
  },
  {
    path: "/api/v1/users",
    router: userRoutes,
    middlewares: [],
  },
  {
  path: "/api/v1/leads",
  router: leadRouter,
  middlewares: [], // add auth middlewares if needed
},
  {
    path: "/api/v1/ip-tracking",
    router: ipTrackingRoutes,
    middlewares: [],
  },
];

const routes: Route[] = [
  {
    path: "/api/v1/auth",
    router: authRouter,
    middlewares: [],
  },
  {
    path: "/api/v1",
    router: createLeadRouter,
    middlewares: [],
  },
  {
    path: "/api/leads/process-sheet",
    router: sheetRouter,
    middlewares: [],
  },
  {
    path: "/api/v1/cron-logs",
    router: cronLogsRouter,
    middlewares: [],
  },
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

  // adding authenticated routes
  authenticatedRoutes.forEach((route: Route) => {
    app.use(
      route.path,
      addContext,
      verifyTokenMiddleware,
      ...(route.middlewares ?? []),
      route.router
    );
  });

  // adding other routes
  routes.forEach((route: Route) => {
    app.use(route.path, addContext, ...(route.middlewares ?? []), route.router);
  });
};

export default configureRoutes;
