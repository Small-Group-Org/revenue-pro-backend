import FeatureRequest from './models/featureRequest.model.js';
import { IFeatureRequestDocument } from '../domain/featureRequest.domain.js';

export class FeatureRequestRepository {
  /**
   * Create a new feature request
   */
  async create(data: Partial<IFeatureRequestDocument>): Promise<IFeatureRequestDocument> {
    const featureRequest = new FeatureRequest(data);
    return await featureRequest.save();
  }

  /**
   * Find feature requests with filters
   */
  async find(filter: any = {}): Promise<IFeatureRequestDocument[]> {
    return await FeatureRequest.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find feature request by ID
   */
  async findById(id: string): Promise<IFeatureRequestDocument | null> {
    return await FeatureRequest.findById(id)
      .populate('userId', 'name email')
      .exec();
  }

  /**
   * Update feature request
   */
  async update(id: string, data: Partial<IFeatureRequestDocument>): Promise<IFeatureRequestDocument | null> {
    return await FeatureRequest.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    ).exec();
  }

  /**
   * Delete feature request
   */
  async delete(id: string): Promise<boolean> {
    const result = await FeatureRequest.findByIdAndDelete(id).exec();
    return result !== null;
  }

  /**
   * Count feature requests
   */
  async count(filter: any = {}): Promise<number> {
    return await FeatureRequest.countDocuments(filter).exec();
  }
}
