import { Request, Response } from 'express';
import { googleSheetsService } from '../services/featureRequest/googleSheets.service.js';

export class FeatureRequestController {
  /**
   * Create a new feature request
   * @route POST /api/v1/feature-requests
   */
  async createFeatureRequest(req: Request, res: Response): Promise<void> {
    try {
      const { title, description } = req.body;
      const userId = req.context.getUserId();
      const user = req.context.getUser();
      
      // Validation
      if (!title || !description) {
        res.status(400).json({
          success: false,
          message: 'Title and description are required'
        });
        return;
      }
      
      if (!user || !user.name || !user.email) {
        res.status(400).json({
          success: false,
          message: 'User information not found'
        });
        return;
      }
      
      // Submit to Google Sheets
      const result = await googleSheetsService.appendFeatureRequest({
        userName: user.name,
        userId: userId,
        userEmail: user.email,
        title: title.trim(),
        description: description.trim()
      });
      
      if (result.success) {
        res.status(201).json({
          success: true,
          message: result.message,
          data: {
            title,
            description,
            submittedAt: new Date().toISOString()
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error: any) {
      console.error('Error in createFeatureRequest:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error'
      });
    }
  }
}