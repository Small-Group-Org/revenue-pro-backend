import mongoose from "mongoose";
import { config } from "../../config.js";
import logger from "../../utils/logger.js";
export const connectDB = async () => {
    let conn = null;
    try {
        if (!config.MONGODB_URL) {
            throw new Error("MONGODB_URL environment variable is not defined");
        }
        conn = (await mongoose.connect(config.MONGODB_URL)).connection;
        logger.info(`Database connected`);
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(`Error while connecting mongodb : ${error.message}`);
        }
        else {
            console.error("An unknown error occurred while connecting to MongoDB");
        }
        process.exit(1);
    }
    return conn;
};
