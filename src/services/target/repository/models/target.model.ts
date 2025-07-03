import { Schema, model, Document } from 'mongoose';
import { ITarget, IMonthlyTarget} from '../../domain/target.domain.js'

export interface ITargetDocument extends ITarget, Document {}

const monthlyTargetSchema = new Schema<IMonthlyTarget>({
  month: { type: Number, required: true },
  leads: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  avgJobSize: { type: Number, default: 0 },
}, {_id: false});

const targetSchema = new Schema<ITargetDocument>({
  year: { type: Number, required: true, unique: true },
  appointmentRate: { type: Number, default: 0 },
  showRate: { type: Number, default: 0 },
  closeRate: { type: Number, default: 0 },
  monthly: [monthlyTargetSchema],
  adSpendBudget: { type: Number, default: 0 },
  costPerLead: { type: Number, default: 0 },
  costPerEstimateSet: { type: Number, default: 0 },
  costPerJobBooked: { type: Number, default: 0 },
}, { timestamps: true });

export default model<ITargetDocument>('Target', targetSchema);