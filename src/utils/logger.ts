import winston from "winston";
import { v4 as uuidv4 } from "uuid";
import { Request, Response, NextFunction } from "express";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

const getCurrentDate = () => {
  const now = new Date();
  return now.toISOString().split("T")[0];
};

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: false, level: true }),
  winston.format.printf((info) => {
    const requestId = info.requestId ? `[${info.requestId}] ` : "";
    return `${info.timestamp} ${info.level}: ${requestId}${info.message}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.printf((info) => {
    const requestId = info.requestId ? `[${info.requestId}] ` : "";
    return `${info.timestamp} ${info.level}: ${requestId}${info.message}`;
  })
);

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: "http",
  }),
  // new winston.transports.File({
  //   filename: `logs/${getCurrentDate()}.log`,
  //   format: fileFormat,
  //   level: "http",
  // }),
  // new winston.transports.File({
  //   filename: `logs/${getCurrentDate()}-error.log`,
  //   level: "error",
  //   format: fileFormat,
  // }),
  new winston.transports.Console({
    format: consoleFormat,
    level: "error",
  }),
];

const logger = winston.createLogger({
  level: "http",
  levels,
  transports,
});

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.requestId = uuidv4();
  next();
};

export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  logger.http(`Incoming ${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${res.statusCode} ${req.originalUrl} - ${duration}ms`, {
      requestId: req.requestId,
    });
  });

  next();
};

// Create a wrapper function to include request ID in logs
export const createRequestLogger = (req: Request) => {
  return {
    error: (message: string, meta?: any) =>
      logger.error(message, { requestId: req.requestId, ...meta }),
    warn: (message: string, meta?: any) =>
      logger.warn(message, { requestId: req.requestId, ...meta }),
    info: (message: string, meta?: any) =>
      logger.info(message, { requestId: req.requestId, ...meta }),
    debug: (message: string, meta?: any) =>
      logger.debug(message, { requestId: req.requestId, ...meta }),
    http: (message: string, meta?: any) =>
      logger.http(message, { requestId: req.requestId, ...meta }),
  };
};

export default logger;
