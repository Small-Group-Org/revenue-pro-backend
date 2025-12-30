import { FeatureRequestRepository } from '../repository/featureRequest.repository.js';
export class FeatureRequestService {
    constructor() {
        this.repository = new FeatureRequestRepository();
    }
    /**
     * Create a new feature request
     */
    async createFeatureRequest(data) {
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
    async getAllFeatureRequests(filter) {
        const query = {};
        if (filter?.status)
            query.status = filter.status;
        if (filter?.userId)
            query.userId = filter.userId;
        return await this.repository.find(query);
    }
    /**
     * Get user's own feature requests
     */
    async getUserFeatureRequests(userId) {
        return await this.repository.find({ userId });
    }
    /**
     * Update feature request (Admin only)
     */
    async updateFeatureRequest(id, data) {
        return await this.repository.update(id, data);
    }
}
