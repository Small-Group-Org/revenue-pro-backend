import bcrypt from "bcrypt";

import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth/utils/token.js";
import { Context } from "../services/common/domain/context.js";

declare global {
  namespace Express {
    interface Request {
      context: Context;
      requestId: string;
    }
  }
}

const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);

export const encryptPassword = (password: string): string => bcrypt.hashSync(password, salt);
export const comparePassword = (password: string, hashedPassword: string): boolean =>
  bcrypt.compareSync(password, hashedPassword);

export const verifyTokenMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const accessToken = req.headers.accesstoken;
    const refreshToken = req.headers.refreshtoken;

    if (!accessToken || !refreshToken) {
      throw new Error("Access token and refresh token are required");
    }

    const result = await verifyToken(accessToken.toString(), refreshToken.toString());
    req.context.setUserId(result?.user?._id.toString());
    req.context.setOrgId(result?.user?._id.toString());
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Unauthorized - Invalid or missing token",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
