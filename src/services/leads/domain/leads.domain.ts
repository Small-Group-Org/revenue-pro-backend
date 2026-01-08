import { Document } from "mongoose";

export type LeadStatus = 
  | 'new' 
  | 'in_progress' 
  | 'estimate_set' 
  | 'virtual_quote'
  | 'estimate_canceled'
  | 'proposal_presented'
  | 'job_booked'
  | 'job_lost'
  | 'estimate_rescheduled'
  | 'unqualified';

export interface StatusHistoryEntry {
  status: LeadStatus;
  timestamp: Date;
}

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
  proposalAmount?: number; // allowed when status is: estimate_set, virtual_quote, proposal_presented, job_lost
  jobBookedAmount?: number; // allowed when status is: job_booked
  notes?: string; // New field for notes
  leadScore?: number; // calculated lead score
  statusHistory?: StatusHistoryEntry[]; // Tracks latest timestamp for each unique status
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
