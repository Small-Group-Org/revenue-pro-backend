import { Request, Response, NextFunction } from "express";

// You should store this securely in a .env file
const LEADS_API_KEY = process.env.LEADS_API_KEY;

export const verifyApiKey = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.header("LEADS_API_KEY");

    if (!LEADS_API_KEY) {
    console.error("LEADS_API_KEY is not defined in environment variables.");
    return res.status(500).json({ error: "Internal Server Error" });
    }

    if (!apiKey || apiKey !== LEADS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing API key" });
    }

    next();
};