import { Schema, model, Document } from 'mongoose';

export interface IAdNamesAmount {
  adName: string;
  budget: number;
}

export interface IWeeklyActual {
  userId: string;
  startDate: string;
  endDate: string;
  testingBudgetSpent: number;
  awarenessBrandingBudgetSpent: number;
  leadGenerationBudgetSpent: number;
  revenue: number;
  sales: number;        // renamed from jobsBooked
  leads: number;        // new field
  estimatesRan: number;
  estimatesSet: number;
  adNamesAmount: IAdNamesAmount[]; // new field: array of ad names with their budgets
}

export interface IWeeklyActualDocument extends IWeeklyActual, Document {}

const weeklyActualSchema = new Schema<IWeeklyActualDocument>({
  userId: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  testingBudgetSpent: { type: Number, required: true },
  awarenessBrandingBudgetSpent: { type: Number, required: true },
  leadGenerationBudgetSpent: { type: Number, required: true },
  revenue: { type: Number, required: true },
  sales: { type: Number, required: true },            // updated
  leads: { type: Number, required: true },            // new field
  estimatesRan: { type: Number, required: true },
  estimatesSet: { type: Number, required: true },
  adNamesAmount: {
    type: [
      {
        adName: { type: String, required: true },
        budget: { type: Number, required: true, default: 0 },
        _id: false, // Disable automatic _id generation for subdocuments
      },
    ],
    default: [],
    },
}, { timestamps: true });

// Enforce uniqueness on (userId + startDate)
weeklyActualSchema.index({ userId: 1, startDate: 1 }, { unique: true });

export default model<IWeeklyActualDocument>('WeeklyActual', weeklyActualSchema);
