import { Schema, model, Document } from 'mongoose';
import { IWeeklyTarget } from '../../domain/target.domain.js';

export interface IWeeklyTargetDocument extends IWeeklyTarget, Document {}

const weeklyTargetSchema = new Schema<IWeeklyTargetDocument>({
  userId: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  year: { type: Number, required: true },
  weekNumber: { type: Number, required: true },
  appointmentRate: { type: Number, required: true },
  avgJobSize: { type: Number, required: true },
  closeRate: { type: Number, required: true },
  com: { type: Number, required: true },
  revenue: { type: Number, required: true },
  showRate: { type: Number, required: true },
  queryType: { type: String, required: true },
  managementCost: { type: Number, required: true },
}, { timestamps: true });

// Index on startDate for efficient queries
weeklyTargetSchema.index({ userId: 1, year: 1, weekNumber: 1 }, { unique: true });

export default model<IWeeklyTargetDocument>('WeeklyTarget', weeklyTargetSchema);