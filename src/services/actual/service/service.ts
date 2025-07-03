import Actual, { IActualDocument } from '../repository/models/actual.model.js';
import { IActual } from '../domain/actual.domain.js';

export class ActualService {
  public async upsert(data: Partial<IActual>): Promise<IActualDocument> {
    const filter = {
      weekStartDate: data.weekStartDate,
    };

    const actual = await Actual.findOneAndUpdate(
      filter,
      { $set: data },
      { upsert: true, new: true }
    );

    if (!actual) throw new Error('Failed to upsert actual.');
    return actual;
  }
}