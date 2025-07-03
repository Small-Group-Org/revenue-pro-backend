import { Request, Response, NextFunction } from "express";
import { Context } from "../services/common/domain/context.js";


export function addContext(req: Request, res: Response, next: NextFunction) {
  req.context = new Context();
  next();
}