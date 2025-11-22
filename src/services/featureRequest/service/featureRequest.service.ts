import { FeatureRequestRepository } from '../repository/featureRequest.repository.js';
import { IFeatureRequestDocument } from '../domain/featureRequest.domain.js';

export interface CreateFeatureRequestInput {
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  description: string;
}

export class FeatureRequestService {
  private repository: FeatureRequestRepository;

  constructor() {
    this.repository = new FeatureRequestRepository();
  }

  /**
   * Create a new feature request
   */
  async createFeatureRequest(data: CreateFeatureRequestInput): Promise<IFeatureRequestDocument> {
    const featureRequest = await this.repository.create({
      userId: data.userId,
      userName: data.userName,
      userEmail: data.userEmail,
      title: data.title,
      description: data.description,
      status: 'new'
    });

    return featureRequest;
  }

  /**
   * Get all feature requests (Admin)
   */
  async getAllFeatureRequests(filter?: {
    status?: string;
    userId?: string;
  }): Promise<IFeatureRequestDocument[]> {
    const query: any = {};
    
    if (filter?.status) query.status = filter.status;
    if (filter?.userId) query.userId = filter.userId;

    return await this.repository.find(query);
  }

  /**
   * Get user's own feature requests
   */
  async getUserFeatureRequests(userId: string): Promise<IFeatureRequestDocument[]> {
    return await this.repository.find({ userId });
  }

  /**
   * Get feature request by ID
   */
  async getFeatureRequestById(id: string): Promise<IFeatureRequestDocument | null> {
    return await this.repository.findById(id);
  }

  /**
   * Update feature request (Admin only)
   */
  async updateFeatureRequest(
    id: string,
    data: {
      status?: 'new' | 'accepted' | 'rejected' | 'information_needed';
    }
  ): Promise<IFeatureRequestDocument | null> {
    return await this.repository.update(id, data);
  }

  /**
   * Delete feature request (Admin only)
   */
  async deleteFeatureRequest(id: string): Promise<boolean> {
    return await this.repository.delete(id);
  }

  /**
   * Get feature request statistics
   */
  async getStatistics(userId?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
  }> {
    const filter = userId ? { userId } : {};
    const requests = await this.repository.find(filter);

    const byStatus: Record<string, number> = {};

    requests.forEach((req) => {
      byStatus[req.status] = (byStatus[req.status] || 0) + 1;
    });

    return {
      total: requests.length,
      byStatus
    };
  }
}
