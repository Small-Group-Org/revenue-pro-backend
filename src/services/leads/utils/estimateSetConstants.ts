/**
 * Centralized estimate set and unqualified lead calculations
 * 
 * Usage in MongoDB: { $in: ["$status", [...ESTIMATE_SET_STATUSES]] }
 */

import { LeadStatus } from '../domain/leads.domain.js';

export const ESTIMATE_SET_STATUSES: readonly LeadStatus[] = [
  'estimate_canceled',
  'job_lost',
  'estimate_set',
  'virtual_quote',
  'proposal_presented',
  'job_booked',
  'estimate_rescheduled'
] as const;

export const UNQUALIFIED_STATUSES: readonly LeadStatus[] = [
  'unqualified'
] as const;

export function isEstimateSetStatus(status: LeadStatus): boolean {
  return ESTIMATE_SET_STATUSES.includes(status);
}

export function isUnqualifiedStatus(status: LeadStatus): boolean {
  return UNQUALIFIED_STATUSES.includes(status);
}

export function calculateEstimateSetCount(statusCounts: {
  estimate_set?: number;
  virtual_quote?: number;
  proposal_presented?: number;
  job_booked?: number;
  estimate_canceled?: number;
  job_lost?: number;
  estimate_rescheduled?: number;
}): number {
  return (
    (statusCounts.estimate_set || 0) +
    (statusCounts.virtual_quote || 0) +
    (statusCounts.proposal_presented || 0) +
    (statusCounts.job_booked || 0) +
    (statusCounts.estimate_canceled || 0) +
    (statusCounts.job_lost || 0) +
    (statusCounts.estimate_rescheduled || 0)
  );
}

export function calculateUnqualifiedCount(statusCounts: {
  unqualified?: number;
}): number {
  return statusCounts.unqualified || 0;
}

/** Formula: estimateSetCount / (estimateSetCount + unqualifiedCount) * 100 */
export function calculateEstimateSetRate(
  estimateSetCount: number,
  unqualifiedCount: number
): number | null {
  const total = estimateSetCount + unqualifiedCount;
  if (total === 0) {
    return null;
  }
  return Number(((estimateSetCount / total) * 100).toFixed(2));
}

export function calculateEstimateSetRateFormatted(
  estimateSetCount: number,
  unqualifiedCount: number,
  decimalPlaces: number = 1
): string {
  const total = estimateSetCount + unqualifiedCount;
  if (total === 0) {
    return '0.0';
  }
  return ((estimateSetCount / total) * 100).toFixed(decimalPlaces);
}

export function countEstimateSetLeads(leads: Array<{ status: LeadStatus }>): number {
  return leads.filter(lead => isEstimateSetStatus(lead.status)).length;
}

export function countUnqualifiedLeads(leads: Array<{ status: LeadStatus }>): number {
  return leads.filter(lead => isUnqualifiedStatus(lead.status)).length;
}

/** Returns individual status counts plus totals and rate */
export function getEstimateSetBreakdown(leads: Array<{ status: LeadStatus }>) {
  const breakdown = {
    estimate_set: 0,
    virtual_quote: 0,
    proposal_presented: 0,
    job_booked: 0,
    estimate_canceled: 0,
    job_lost: 0,
    estimate_rescheduled: 0,
    unqualified: 0
  };

  leads.forEach(lead => {
    if (lead.status === 'estimate_set') breakdown.estimate_set += 1;
    else if (lead.status === 'virtual_quote') breakdown.virtual_quote += 1;
    else if (lead.status === 'proposal_presented') breakdown.proposal_presented += 1;
    else if (lead.status === 'job_booked') breakdown.job_booked += 1;
    else if (lead.status === 'estimate_canceled') breakdown.estimate_canceled += 1;
    else if (lead.status === 'job_lost') breakdown.job_lost += 1;
    else if (lead.status === 'estimate_rescheduled') breakdown.estimate_rescheduled += 1;
    else if (lead.status === 'unqualified') breakdown.unqualified += 1;
  });

  const estimateSetTotal = calculateEstimateSetCount(breakdown);
  const unqualifiedTotal = calculateUnqualifiedCount(breakdown);

  return {
    ...breakdown,
    estimateSetTotal,
    unqualifiedTotal,
    estimateSetRate: calculateEstimateSetRate(estimateSetTotal, unqualifiedTotal)
  };
}
