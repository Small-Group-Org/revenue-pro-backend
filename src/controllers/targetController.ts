import { Request, Response } from 'express';
import { TargetService } from '../services/target/service/service.js';

export class TargetController {
  private targetService: TargetService;

  constructor() {
    this.targetService = new TargetService();
  }

  public update = async (req: Request, res: Response): Promise<void> => {
    try {
      const year = parseInt(req.params.year);
      if (isNaN(year)) {
        res.status(400).json({ success: false, message: 'Invalid year provided.' });
        return;
      }
      const updatedTarget = await this.targetService.updateByYear(year, req.body);
      res.status(200).json({ success: true, data: updatedTarget });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}