import dotenv from "dotenv";

dotenv.config();

export const config = {
  PORT: process.env.PORT,
  JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
  MONGODB_URL: process.env.MONGODB_URL,
  CONFIG_SECRET_KEY: process.env.CONFIG_SECRET_KEY,
  ACCESS_TOKEN_LIFE: process.env.ACCESS_TOKEN_LIFE,
  REFRESH_TOKEN_LIFE: process.env.REFRESH_TOKEN_LIFE,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  FRONTEND_URL: process.env.FRONTEND_URL,
  NAME: process.env.NAME,
  GHL_BASE_URL: process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com",
  GHL_API_TOKEN: process.env.GHL_API_TOKEN || "pit-bfe8bbcf-9a29-4264-9b27-5455d42e371a", // GHL Private Integration Token
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID || "X9eKcomDAR6qsdUNTvhv", // GHL Location ID 
  OPPORTUNITY_SYNC_CRON: process.env.OPPORTUNITY_SYNC_CRON || "0 3 * * *", // daily 03:00 UTC
 
};
