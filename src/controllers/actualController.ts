import { Request, Response } from 'express';
import { ActualService } from '../services/actual/service/service.js';

export class ActualController {
  constructor(private actualService: ActualService) {}

  public upsert = async (req: Request, res: Response): Promise<void> => {
    try {
      const upsertedActual = await this.actualService.upsert(req.body);
      res.status(200).json({ success: true, data: upsertedActual });
    } catch (error: any) {
      const statusCode = error.message.includes('required') ? 400 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  };
}