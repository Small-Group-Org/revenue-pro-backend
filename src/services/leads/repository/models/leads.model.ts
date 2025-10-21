import { Schema, model } from 'mongoose';
import { ILeadDocument } from '../../domain/leads.domain.js';

const leadSchema = new Schema<ILeadDocument>(
  {
    leadDate: { type: String, required: true, default: new Date().toISOString() },
    name: { type: String, required: true },
    email: { type: String, required: false, default: '' },
    phone: { type: String, required: false, default: '' },
    zip: { type: String, required: true },
    service: { type: String, required: true },
    adSetName: { type: String, required: true },
    adName: { type: String, required: true },
    status: { 
      type: String, 
      required: true,
      enum: ['new', 'in_progress', 'estimate_set', 'unqualified'],
      default: 'new'
    },
    clientId: { type: String, required: true },
    unqualifiedLeadReason: { type: String, default: '' },
    proposalAmount: { type: Number, required: false, default: 0 },
    jobBookedAmount: { type: Number, required: false, default: 0 },
    notes: { type: String, default: '', maxlength: 2000 }, // New notes field with max length
    leadScore: { type: Number, required: false },
    conversionRates: {
      type: Object,
      default: {},
      required: false // stores per-lead conversion rates for service, adSetName, adName, leadDate, zip
    },
    lastManualUpdate: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Optional index for uniqueness by clientId and leadDate
// Uncomment if needed to avoid duplicates per client per day
// leadSchema.index({ clientId: 1, leadDate: 1 }, { unique: true });

export default model<ILeadDocument>('Lead', leadSchema);
