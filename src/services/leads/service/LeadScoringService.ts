import { ILead } from "../domain/leads.domain.js";
import _ from "lodash";
import { ILeadRepository, IConversionRateRepository } from "../repository/interfaces.js";
import { leadRepository } from "../repository/LeadRepository.js";
import { conversionRateRepository } from "../repository/ConversionRateRepository.js";
import {
  FIELD_WEIGHTS,
  getMonthlyName,
  createConversionRatesMap,
  getConversionRateFromMap,
  getMonthIndex,
  isEmptyValue,
  type LeadKeyField,
  type UniqueKey
} from "../utils/leads.util.js";

// Types for scoring operations
interface UpdateResult {
  updatedConversionRates: number;
  updatedLeads: number;
  totalProcessedLeads: number;
  errors: string[];
  conversionRateStats?: {
    newInserts: number;
    updated: number;
  };
}

interface RecalculateResult {
  totalLeads: number;
  updatedLeads: number;
  errors: string[];
}

interface ConversionData {
  clientId: string;
  keyName: string;
  keyField: LeadKeyField;
  conversionRate: number;
  pastTotalCount: number;
  pastTotalEst: number;
}

export class LeadScoringService {
  
  constructor(
    private leadRepo: ILeadRepository = leadRepository,
    private conversionRateRepo: IConversionRateRepository = conversionRateRepository
  ) {}

  // ============= MAIN SCORING METHODS =============

  /**
   * Update conversion rates and lead scores for all leads of a client
   * - Calculates conversion rates for all 5 fields (service, adSetName, adName, leadDate, zip)
   * - Upserts conversion rates to DB
   * - Recalculates lead scores for all leads
   * - Stores conversion rates for each lead in a new field 'conversionRates'
   */
  async processLeadScoresAndCRsByClientId(clientId: string): Promise<UpdateResult> {
    const errors: string[] = [];
    try {
      // 1. Fetch all leads for client
      const leads = await this.leadRepo.getLeadsByClientId(clientId);
      if (leads.length === 0) {
        return { updatedConversionRates: 0, updatedLeads: 0, totalProcessedLeads: 0, errors: [] };
      }

      // 2. Calculate conversion rates for all unique fields
      const conversionData = this.computeConversionRatesForClient(leads as ILead[], clientId);

      // 3. Upsert conversion rates to DB
      const crUpsertResult = await this.conversionRateRepo.batchUpsertConversionRates(conversionData);

      // 4. Fetch conversion rates from DB for this client
      const dbConversionRates = await this.conversionRateRepo.getConversionRates({ clientId });
      const conversionRatesMap = createConversionRatesMap(dbConversionRates);
      
      // 5. Build bulk operations using helper function
      const { bulkOps, actuallyUpdatedLeads } = this.prepareLeadScoreAndCRUpdates(leads, conversionRatesMap);

      // 6. Bulk update only changed leads
      let modifiedCount = 0;
      if (bulkOps.length > 0) {
        const result = await this.leadRepo.bulkWriteLeads(bulkOps);
        modifiedCount = result.modifiedCount;
        console.log(`[CR Update] Updated ${modifiedCount} leads with new scores and conversionRates for clientId: ${clientId}`);
      }

      return {
        updatedConversionRates: crUpsertResult.stats.total,
        updatedLeads: actuallyUpdatedLeads,
        totalProcessedLeads: leads.length,
        errors,
        conversionRateStats: {
          newInserts: crUpsertResult.stats.newInserts,
          updated: crUpsertResult.stats.updated
        }
      };
    } catch (error: any) {
      const errorMsg = `[CR Update] Error updating conversion rates and lead scores for clientId ${clientId}: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      return {
        updatedConversionRates: 0,
        updatedLeads: 0,
        totalProcessedLeads: 0,
        errors
      };
    }
  }

  /**
   * Recalculate ALL lead scores for a specific client (manual update function)
   */
  async recalculateAllLeadScores(clientId: string): Promise<RecalculateResult> {
    const errors: string[] = [];
    
    try {
      
      // Get all leads for this client
      const allLeads = await this.leadRepo.getLeadsByClientId(clientId);
      
      if (allLeads.length === 0) {
        return {
          totalLeads: 0,
          updatedLeads: 0,
          errors: [`No leads found for client ${clientId}`]
        };
      }

      // Get conversion rates for this client  
      const conversionRates = await this.conversionRateRepo.getConversionRates({ clientId });
      
      if (conversionRates.length === 0) {
        const updatePayload = { 
          $set: { 
            leadScore: 0,
            conversionRates: {
              service: 0,
              adSetName: 0,
              adName: 0,
              leadDate: 0,
              zip: 0
            }
          } 
        };
      
        const updateResult = await this.leadRepo.updateManyLeads(
          { clientId },
          updatePayload
        );
      
        return {
          totalLeads: allLeads.length,
          updatedLeads: updateResult.modifiedCount || 0,
          errors: []
        };
      }

      // Create conversion rates map for efficient lookups
      const conversionRatesMap = createConversionRatesMap(conversionRates);

      // Build bulk operations using helper function
      const { bulkOps, actuallyUpdatedLeads } = this.prepareLeadScoreAndCRUpdates(allLeads, conversionRatesMap);

      // Bulk update only changed leads
      let modifiedCount = 0;
      if (bulkOps.length > 0) {
        const result = await this.leadRepo.bulkWriteLeads(bulkOps);
        modifiedCount = result.modifiedCount;
        console.log(`Recalculated scores and conversion rates for ${modifiedCount} leads for client ${clientId}`);
      }

      return {
        totalLeads: allLeads.length,
        updatedLeads: actuallyUpdatedLeads,
        errors: []
      };
    } catch (error: any) {
      const errorMsg = `Error recalculating lead scores for client ${clientId}: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      
      return {
        totalLeads: 0,
        updatedLeads: 0,
        errors
      };
    }
  }

  // ============= CORE PROCESSING METHODS =============

  /**
   * Process leads to calculate conversion rates for all unique field values
   */
  computeConversionRatesForClient(leads: ILead[], clientId: string): ConversionData[] {
    const result: ConversionData[] = [];

    // Filter leads by clientId
    const clientLeads = leads.filter((lead) => lead.clientId === clientId);
    
    if (clientLeads.length === 0) {
      return result;
    }

    const allKeys = this.getUniqueFieldValues(clientLeads);

    for (const { value: keyName, field: keyField } of allKeys) {
      const { conversionRate, pastTotalCount, pastTotalEst } =
        this.calculateConversionRate(clientLeads, keyName, keyField);
      result.push({
        clientId,
        keyName,
        keyField,
        conversionRate,
        pastTotalCount,
        pastTotalEst,
      });
    }

    return result;
  }

  // ============= PRIVATE HELPER METHODS =============

  /**
   * Get unique field values from leads for conversion rate calculation
   */
  private getUniqueFieldValues(leads: ILead[]): UniqueKey[] {
    // Use Maps for better performance with large datasets
    const serviceSet = new Set<string>();
    const adSetNameSet = new Set<string>();
    const adNameSet = new Set<string>();
    const monthSet = new Set<string>();
    const zipSet = new Set<string>();

    // Single pass through leads array for optimal performance
    for (const lead of leads) {
      if (!isEmptyValue(lead.service)) {
        serviceSet.add(lead.service);
      }
      
      if (!isEmptyValue(lead.adSetName)) {
        adSetNameSet.add(lead.adSetName);
      }
      
      if (!isEmptyValue(lead.adName)) {
        adNameSet.add(lead.adName);
      }
      
      if (!isEmptyValue(lead.zip || '')) {
        zipSet.add(lead.zip || '');
      }
      
      // Optimized month extraction
      if (lead.leadDate) {
        const monthName = getMonthlyName(lead.leadDate);
        if (monthName) monthSet.add(monthName);
      }
    }

    // Pre-allocate result array for better memory management
    const result: UniqueKey[] = [];
    
    // Convert sets to UniqueKey objects efficiently
    serviceSet.forEach(service => result.push({ value: service, field: "service" }));
    adSetNameSet.forEach(adSetName => result.push({ value: adSetName, field: "adSetName" }));
    adNameSet.forEach(adName => result.push({ value: adName, field: "adName" }));
    monthSet.forEach(month => result.push({ value: month, field: "leadDate" }));
    zipSet.forEach(zip => result.push({ value: zip, field: "zip" }));

    return result;
  }

  /**
   * Calculate conversion rate for a specific field and value
   * Conversion Rate = netEstimates / (netEstimates + netUnqualifieds)
   * netEstimates = estimate_set + virtual_quote + proposal_presented + job_booked
   * netUnqualifieds = unqualified + estimate_canceled + job_lost
   */
  private calculateConversionRate(
    clientLeads: ILead[], // Already filtered by clientId
    keyName: string,
    keyField: LeadKeyField
  ) {
    let netEstimates = 0; // estimate_set + virtual_quote + proposal_presented + job_booked
    let netUnqualifieds = 0; // unqualified + estimate_canceled + job_lost

    // Build a matcher for the selected key type, then do a single-pass count
    let matches: (lead: ILead) => boolean;

    if (keyField === 'leadDate') {
      const monthIndex = getMonthIndex(keyName);
      if (monthIndex === undefined) throw new Error(`Invalid month name: ${keyName}`);
      matches = (lead: ILead) => new Date(lead.leadDate).getMonth() === monthIndex;
    } else {
      const normalizedKey = String(keyName ?? '').trim().toLowerCase();
      matches = (lead: ILead) => {
        const raw = (lead as any)[keyField];
        const normalizedVal = String(raw ?? '').trim().toLowerCase();
        return normalizedVal === normalizedKey;
      }
    }

    for (const lead of clientLeads) {
      if (!matches(lead)) continue;

      // Count qualified/successful statuses
      if (lead.status === 'estimate_set' ||
          lead.status === 'virtual_quote' ||
          lead.status === 'proposal_presented' ||
          lead.status === 'job_booked') {
        netEstimates++;
      }
      // Count unqualified/unsuccessful statuses
      else if (lead.status === 'unqualified' ||
               lead.status === 'estimate_canceled' ||
               lead.status === 'job_lost') {
        netUnqualifieds++;
      }
    }

    // Conversion rate as decimal, rounded to 2 decimals
    const effectiveTotal = netEstimates + netUnqualifieds;
    const conversionRate = effectiveTotal === 0 ? 0 :
      Math.round((netEstimates / effectiveTotal) * 100) / 100;

    return {
      conversionRate,
      pastTotalCount: effectiveTotal,
      pastTotalEst: netEstimates,
    };
  }

  /**
   * Calculate conversion rates and lead score for a single lead
   */
  private calculateLeadScoreAndCR(lead: any, conversionRatesMap: any): {
    conversionRates: {
      service: number;
      adSetName: number;
      adName: number;
      leadDate: number;
      zip: number;
    };
    leadScore: number;
  } {
    // Get conversion rates for each field from DB using efficient Map lookups
    const serviceRate = getConversionRateFromMap(conversionRatesMap, 'service', lead.service || '');
    const adSetNameRate = getConversionRateFromMap(conversionRatesMap, 'adSetName', lead.adSetName || '');
    const adNameRate = getConversionRateFromMap(conversionRatesMap, 'adName', lead.adName || '');
    
    const dt = new Date(lead.leadDate);
    const monthName = dt.toLocaleString("en-US", { month: "long" });
    const leadDateRate = getConversionRateFromMap(conversionRatesMap, 'leadDate', monthName);
    const zipRate = getConversionRateFromMap(conversionRatesMap, 'zip', lead.zip || '');

    // Build conversionRates object for this lead
    const conversionRates = {
      service: serviceRate,
      adSetName: adSetNameRate,
      adName: adNameRate,
      leadDate: leadDateRate,
      zip: zipRate
    };

    // Calculate leadScore using all fields
    const weightedScore =
      (serviceRate * FIELD_WEIGHTS.service) +
      (adSetNameRate * FIELD_WEIGHTS.adSetName) +
      (adNameRate * FIELD_WEIGHTS.adName) +
      (leadDateRate * FIELD_WEIGHTS.leadDate) +
      (zipRate * FIELD_WEIGHTS.zip);
    
    const leadScore = Math.round(Math.max(0, Math.min(100, weightedScore)));

    return { conversionRates, leadScore };
  }

  /**
   * Build bulk operations for lead score and conversion rates updates
   */
  private prepareLeadScoreAndCRUpdates(leads: any[], conversionRatesMap: any): {
    bulkOps: any[];
    actuallyUpdatedLeads: number;
  } {
    const bulkOps = [];
    let actuallyUpdatedLeads = 0;

    for (const lead of leads) {
      const { conversionRates, leadScore } = this.calculateLeadScoreAndCR(lead, conversionRatesMap);
      // Only update if leadScore or conversionRates have changed - performance optimization
      const leadScoreChanged = lead.leadScore !== leadScore;
      const conversionRatesChanged = !_.isEqual(lead.conversionRates ?? {}, conversionRates);
      
      if (leadScoreChanged || conversionRatesChanged) {
        bulkOps.push({
          updateOne: {
            filter: { _id: lead._id },
            update: {
              $set: {
                leadScore,
                conversionRates
              }
            }
          }
        });
        actuallyUpdatedLeads++;
      }
    }

    return { bulkOps, actuallyUpdatedLeads };
  }
}
