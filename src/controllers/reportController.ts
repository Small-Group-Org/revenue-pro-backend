import { Request, Response } from 'express';
import { ReportService } from '@/services/reports/service/service.js';

export class ReportController {
  constructor(private reportService: ReportService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    try {
      const { timeframe, date } = req.query;
      if (typeof timeframe !== 'string' || !['weekly', 'monthly', 'yearly'].includes(timeframe)) {
        res.status(400).json({ success: false, message: 'Invalid or missing timeframe.' });
        return;
      }
      const reportData = await this.reportService.generate(timeframe, date as string | undefined);
      res.status(200).json({ success: true, data: reportData });
    } catch (error: any) {
      const statusCode = error.message.includes('found') ? 404 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  };
}