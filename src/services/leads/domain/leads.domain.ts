import { Document } from "mongoose";

export type LeadStatus = 'new' | 'in_progress' | 'estimate_set' | 'unqualified';

export interface ILead {
  leadDate: string;
  name: string;
  email?: string;
  phone?: string;
  zip: string;
  service: string;
  adSetName: string;
  adName: string;
  status: LeadStatus;
  clientId: string;
  unqualifiedLeadReason?: string;
  proposalAmount?: number; // only when status is 'estimate_set'
  jobBookedAmount?: number; // only when status is 'estimate_set'
  notes?: string; // New field for notes
  leadScore?: number; // calculated lead score
  conversionRates?: {
    service?: number;
    adSetName?: number;
    adName?: number;
    leadDate?: number;
    zip?: number;
    [key: string]: number | undefined;
  };
  lastManualUpdate?: Date | null;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

export interface ILeadDocument extends ILead, Document {
  conversionRates?: {
    service?: number;
    adSetName?: number;
    adName?: number;
    leadDate?: number;
    zip?: number;
    [key: string]: number | undefined;
  };
}
