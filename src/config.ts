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
  GHL_BASE_URL: "https://services.leadconnectorhq.com",
  GHL_API_TOKEN: process.env.GHL_API_TOKEN, // GHL Private Integration Token
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID || "JjaWKzrXNSMtJKXvvZa7", // GHL Location ID 
  OPPORTUNITY_SYNC_CRON: process.env.OPPORTUNITY_SYNC_CRON || "0 3 * * *", // daily 03:00 UTC
  
  // Google Sheets Configuration
  GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID || '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY || '',
  LEAD_SHEETS_SYNC_CRON: process.env.LEAD_SHEETS_SYNC_CRON || "0 4 * * *", // daily 04:00 UTC
  
  // Facebook Ads Configuration
  FB_ACCESS_TOKEN: process.env.FB_ACCESS_TOKEN,
  FB_API_VERSION: process.env.FB_API_VERSION || 'v21.0',
  // Meta OAuth Configuration
  META_CLIENT_ID: process.env.META_CLIENT_ID || '',
  META_CLIENT_SECRET: process.env.META_CLIENT_SECRET || '',
  // This is the redirect URI where Facebook sends the authorization code back to our backend
  // Must match exactly what's configured in Facebook App settings
  META_REDIRECT_URI: process.env.META_REDIRECT_URI || '',
  META_API_VERSION: process.env.META_API_VERSION || '',
 
};
