import FeatureRequest from './models/featureRequest.model.js';
export class FeatureRequestRepository {
    /**
     * Create a new feature request
     */
    async create(data) {
        const featureRequest = new FeatureRequest(data);
        return await featureRequest.save();
    }
    /**
     * Find feature requests with filters
     */
    async find(filter = {}) {
        return await FeatureRequest.find(filter)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .exec();
    }
    /**
     * Find feature request by ID
     */
    async findById(id) {
        return await FeatureRequest.findById(id)
            .populate('userId', 'name email')
            .exec();
    }
    /**
     * Update feature request
     */
    async update(id, data) {
        return await FeatureRequest.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).exec();
    }
}
