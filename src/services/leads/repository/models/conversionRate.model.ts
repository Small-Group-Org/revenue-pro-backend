import { Schema, model, Document } from 'mongoose';

export interface IConversionRate {
  clientId: string; // MongoDB ObjectId stored as string
  keyName: string;
  keyField: string;
  conversionRate: number;
  pastTotalCount: number;
  pastTotalEst: number;
}

export interface IConversionRateDocument extends IConversionRate, Document {}

const conversionRateSchema = new Schema<IConversionRateDocument>(
  {
    clientId: { type: String, required: true },
    keyName: { type: String, required: true },
    keyField: { type: String, required: true },
    conversionRate: { type: Number, required: true },
    pastTotalCount: { type: Number, required: true }, // (estimate_set + unqualified)
    pastTotalEst: { type: Number, required: true },
  },
  { timestamps: true }
);

// Index to prevent duplicates per client per keyField/keyName
conversionRateSchema.index({ clientId: 1, keyField: 1, keyName: 1 }, { unique: true });

export default model<IConversionRateDocument>('ConversionRate', conversionRateSchema);
