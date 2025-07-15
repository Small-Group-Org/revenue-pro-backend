import { IActual } from '../../domain/actual.domain.js';
import { Document, Schema, model } from 'mongoose';

export interface IActualDocument extends IActual, Document {}

const actualSchema = new Schema<IActualDocument>({
  appointmentRate: { type: Number, required: true },
  avgJobSize: { type: Number, required: true },
  closeRate: { type: Number, required: true },
  com: { type: Number, required: true },
  revenue: { type: Number, required: true },
  showRate: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  queryType: { type: String, required: true },
  userId: { type: String, required: true },
  year: { type: Number, required: true },
  weekNumber: { type: Number, required: true },
});

export default model<IActualDocument>('Actual', actualSchema);