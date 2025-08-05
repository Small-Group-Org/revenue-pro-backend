import { Schema, model, Document } from 'mongoose';

export interface ILead {
  leadDate: string; // Format: "YYYY-MM-DD"
  name: string;
  email: string;
  phone: string;
  zip: string;
  service: string;
  adSetName: string;
  adName: string;
  estimateSet: boolean;
  clientId: string; // MongoDB ObjectId stored as string
  unqualifiedLeadReason: string;
}

export interface ILeadDocument extends ILead, Document {}

const leadSchema = new Schema<ILeadDocument>(
  {
    leadDate: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    zip: { type: String, required: true },
    service: { type: String, required: true },
    adSetName: { type: String, required: true },
    adName: { type: String, required: true },
    estimateSet: { type: Boolean, required: true },
    clientId: { type: String, required: true },
    unqualifiedLeadReason: { type: String, required: true },
  },
  { timestamps: true }
);

// Optional index for uniqueness by clientId and leadDate
// Uncomment if needed to avoid duplicates per client per day
// leadSchema.index({ clientId: 1, leadDate: 1 }, { unique: true });

export default model<ILeadDocument>('Lead', leadSchema);
