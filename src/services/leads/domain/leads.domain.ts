import { Document } from "mongoose";

export type LeadStatus = 'new' | 'in_progress' | 'estimate_set' | 'unqualified';

export interface ILead {
  leadDate: string; // ISO date string: e.g. "2025-07-15"
  name: string;
  email: string;
  phone: string;
  zip: string;
  service: string;
  adSetName: string;
  adName: string;
  status: LeadStatus;
  clientId: string; // ObjectId reference as string
  unqualifiedLeadReason: string;
}

export interface ILeadDocument extends ILead, Document {}
