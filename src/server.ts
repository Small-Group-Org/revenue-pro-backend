import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import cors from "cors";
import { connectDB } from "./pkg/mongodb/connection.js";
import configureRoutes from "./routes/routes.js";
import { config } from "./config.js";
import di from "./di/di.js";
import logger, {
  requestIdMiddleware,
  requestLoggerMiddleware,
  createRequestLogger,
} from "./utils/logger.js";

// Initialize express app
const app: Express = express();

// CORS setup
app.use(cors());

// Ensure preflight is handled
app.options("*", cors());

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
});
