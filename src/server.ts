import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import cors from "cors";
import { connectDB } from "./pkg/mongodb/connection.js";
import configureRoutes from "./routes/routes.js";
import { config } from "./config.js";
import logger, {
  requestIdMiddleware,
  requestLoggerMiddleware,
  createRequestLogger,
} from "./utils/logger.js";
import conversionRateUpdateService from "./services/cron/conversionRateUpdateService.js";
import opportunitySyncCron from "./services/opportunities/cron/opportunitySync.cron.js";
import multiClientOpportunitySyncCron from "./services/opportunities/cron/multiClientOpportunitySync.cron.js";
import leadSheetsSyncCron from "./services/leads/cron/leadSheetsSync.cron.js";

// Initialize express app
const app: Express = express();

// CORS setup
app.use(cors({
  origin: '*',
  credentials: false, // Do not allow credentials when using '*'
}));

// Ensure preflight is handled
app.options("*", cors({
  origin: '*',
  credentials: false,
}));

// Add request ID and logging middleware
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// Configure session
app.use(
  session({
    secret: config.SESSION_SECRET || "default-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Configure body parser
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

// Connect to database and configure scheduler
connectDB()
  .catch((error) => {
    logger.error("Failed to connect to database:", error);
    process.exit(1);
  });

configureRoutes(app);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const requestLogger = createRequestLogger(req);
  requestLogger.error(`Error: ${err.message}`);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start server
const PORT: string | number = config.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Start the weekly conversion rate update cron job
  conversionRateUpdateService.startWeeklyCronJob();
  logger.info("Weekly conversion rate update cron job initialized");


  // opportunitySyncCron.start();
 

  // Start multi-client opportunity sync cron job
  multiClientOpportunitySyncCron.start();
  logger.info("Multi-client opportunity sync cron job initialized");

  // Start lead sheets sync cron job
  // Start the lead sheets sync cron job
  leadSheetsSyncCron.start();
  logger.info("Lead sheets sync cron job initialized");
});
