import { Request, Response } from 'express';
import { FeatureRequestService } from '../services/featureRequest/service/featureRequest.service.js';

export class FeatureRequestController {
  private service: FeatureRequestService;

  constructor() {
    this.service = new FeatureRequestService();
  }
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
      
      // Save to database
      const featureRequest = await this.service.createFeatureRequest({
        userId: userId,
        userName: user.name,
        userEmail: user.email,
        title: title.trim(),
        description: description.trim()
      });
      
      res.status(201).json({
        success: true,
        message: 'Feature request submitted successfully',
        data: featureRequest
      });
    } catch (error: any) {
      console.error('Error in createFeatureRequest:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error'
      });
    }
  }
  
  /**
   * Get all feature requests (Admin) or user's own requests (User)
   * @route GET /api/v1/feature-requests
   */
  async getFeatureRequests(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.context.getUserId();
      const user = req.context.getUser();
      const { status } = req.query;
      
      let featureRequests;
      
      if (user?.role === 'ADMIN') {
        // Admin can see all feature requests with optional filters
        featureRequests = await this.service.getAllFeatureRequests({
          status: status as string
        });
      } else {
        // Regular users see only their own feature requests
        featureRequests = await this.service.getUserFeatureRequests(userId);
      }
      
      res.status(200).json({
        success: true,
        data: featureRequests
      });
    } catch (error: any) {
      console.error('Error in getFeatureRequests:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * Update feature request status/priority (Admin only)
   * @route PUT /api/v1/feature-requests/:id
   */
  async updateFeatureRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user = req.context.getUser();
      
      // Only admin can update
      if (user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access denied. Admin only.'
        });
        return;
      }
      
      const updated = await this.service.updateFeatureRequest(id, {
        status
      });
      
      if (!updated) {
        res.status(404).json({
          success: false,
          message: 'Feature request not found'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        message: 'Feature request updated successfully',
        data: updated
      });
    } catch (error: any) {
      console.error('Error in updateFeatureRequest:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error'
      });
    }
  }
}