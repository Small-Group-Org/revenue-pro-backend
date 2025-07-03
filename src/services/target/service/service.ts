import Target, { ITargetDocument } from '../repository/models/target.model.js';
import { ITarget } from '../domain/target.domain.js';

export class TargetService {
  public async updateByYear(year: number, data: Partial<ITarget>): Promise<ITargetDocument> {
    const target = await Target.findOneAndUpdate(
      { year },
      data,
      { new: true, upsert: true, runValidators: true }
    );
    if (!target) throw new Error('Failed to update or create target.');
    return target;
  }
}