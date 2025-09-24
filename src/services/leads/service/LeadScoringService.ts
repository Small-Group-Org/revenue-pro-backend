import { ILead, ILeadDocument } from "../domain/leads.domain.js";
import { ILeadRepository, IConversionRateRepository } from "../repository/interfaces.js";
import { leadRepository } from "../repository/LeadRepository.js";
import { conversionRateRepository } from "../repository/ConversionRateRepository.js";
import { TimezoneUtils } from "../../../utils/timezoneUtils.js";
import {
  FIELD_WEIGHTS,
  getMonthlyName,
  createConversionRatesMap,
  getConversionRateFromMap,
  calculateLeadScore,
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
  async updateConversionRatesAndLeadScoresForClient(clientId: string): Promise<UpdateResult> {
    const errors: string[] = [];
    try {
      // 1. Fetch all leads for client
      const leads = await this.leadRepo.getLeadsByClientId(clientId);
      if (leads.length === 0) {
        return { updatedConversionRates: 0, updatedLeads: 0, totalProcessedLeads: 0, errors: [] };
      }

      // 2. Calculate conversion rates for all unique fields
      const conversionData = this.processLeads(leads as ILead[], clientId);

      // 3. Upsert conversion rates to DB
      const crUpsertResult = await this.conversionRateRepo.batchUpsertConversionRates(conversionData);

      // 4. Fetch conversion rates from DB for this client
      const dbConversionRates = await this.conversionRateRepo.getConversionRates({ clientId });
      const conversionRatesMap = createConversionRatesMap(dbConversionRates);
      
      // 5. Build bulk operations using helper function
      const { bulkOps, actuallyUpdatedLeads } = this.buildLeadUpdateBulkOps(leads, conversionRatesMap);

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
      const { bulkOps, actuallyUpdatedLeads } = this.buildLeadUpdateBulkOps(allLeads, conversionRatesMap);

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
  processLeads(leads: ILead[], clientId: string): ConversionData[] {
    const result: ConversionData[] = [];

    // OPTIMIZATION: Filter leads by clientId once instead of in each calculation
    const clientLeads = leads.filter((lead) => lead.clientId === clientId);
    
    if (clientLeads.length === 0) {
      return result; // Early return if no leads for this client
    }

    const allKeys = this.getUniqueFieldValues(clientLeads); // Use filtered leads

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

  /**
   * Calculate and store lead scores for leads that don't have them
   */
  async calculateAndStoreMissingLeadScores(
    leads: ILeadDocument[], 
    clientId: string
  ): Promise<ILeadDocument[]> {
    // Find leads without lead scores
    const leadsWithoutScores = leads.filter(lead => 
      typeof lead.leadScore === 'undefined' || lead.leadScore === null
    );

    if (leadsWithoutScores.length === 0) {
      return leads;
    }

    try {
      // Get conversion rates for this client
      const conversionRates = await this.conversionRateRepo.getConversionRates({ clientId });
      
      if (conversionRates.length === 0) {        
        // Set all scores to 0 if no conversion rates exist
        const bulkOps = leadsWithoutScores.map(lead => ({
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: { leadScore: 0 } }
          }
        }));

        await this.leadRepo.bulkWriteLeads(bulkOps);
        
        // Update the leads array with score 0
        leads.forEach(lead => {
          if (leadsWithoutScores.some(l => (l._id as any).toString() === (lead._id as any).toString())) {
            lead.leadScore = 0;
          }
        });
        
        return leads;
      }

      // Create conversion rates map for efficient lookups
      const conversionRatesMap = createConversionRatesMap(conversionRates);

      // Calculate scores for leads without them
      const bulkOps = leadsWithoutScores.map(lead => {
        const leadScore = calculateLeadScore(lead, conversionRatesMap);
        return {
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: { leadScore } }
          }
        };
      });

      // Bulk update lead scores in database
      await this.leadRepo.bulkWriteLeads(bulkOps);

      // Update the leads array with calculated scores
      leads.forEach(lead => {
        const leadWithoutScore = leadsWithoutScores.find(l => 
          (l._id as any).toString() === (lead._id as any).toString()
        );
        if (leadWithoutScore) {
          lead.leadScore = calculateLeadScore(lead, conversionRatesMap);
        }
      });

      return leads;
    } catch (error: any) {
      console.error(`Error calculating lead scores for client ${clientId}:`, error);
      // Return leads as-is if calculation fails
      return leads;
    }
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
   */
  private calculateConversionRate(
    clientLeads: ILead[], // Already filtered by clientId
    keyName: string,
    keyField: LeadKeyField
  ) {
    let totalForKey = 0;
    let yesForKey = 0;

    if (keyField === "leadDate") {
      const monthIndex = getMonthIndex(keyName);
      if (monthIndex === undefined)
        throw new Error(`Invalid month name: ${keyName}`);

      // Single pass through leads for date filtering
      for (const lead of clientLeads) {
        const leadMonth = new Date(lead.leadDate).getMonth();
        if (leadMonth === monthIndex) {
          totalForKey++;
          if (lead.status === 'estimate_set') {
            yesForKey++;
          }
        }
      }
    } else if (keyField === "zip") {
      // Single pass through leads for ZIP filtering
      for (const lead of clientLeads) {
        if (lead.zip === keyName) {
          totalForKey++;
          if (lead.status === 'estimate_set') {
            yesForKey++;
          }
        }
      }
    } else {
      // Single pass through leads for field filtering
      for (const lead of clientLeads) {
        if (lead[keyField] === keyName) {
          totalForKey++;
          if (lead.status === 'estimate_set') {
            yesForKey++;
          }
        }
      }
    }

    // Conversion rate as decimal, rounded to 2 decimals
    const conversionRate = totalForKey === 0 ? 0 :
      Math.round((yesForKey / totalForKey) * 100) / 100;
      
    return {
      conversionRate,
      pastTotalCount: totalForKey,
      pastTotalEst: yesForKey,
    };
  }

  /**
   * Calculate conversion rates and lead score for a single lead
   */
  private calculateLeadConversionRatesAndScore(lead: any, conversionRatesMap: any): {
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
   * Build bulk operations for lead updates
   */
  private buildLeadUpdateBulkOps(leads: any[], conversionRatesMap: any): {
    bulkOps: any[];
    actuallyUpdatedLeads: number;
  } {
    const bulkOps = [];
    let actuallyUpdatedLeads = 0;

    for (const lead of leads) {
      const { conversionRates, leadScore } = this.calculateLeadConversionRatesAndScore(lead, conversionRatesMap);
      // Only update if leadScore or conversionRates have changed
      const leadScoreChanged = lead.leadScore !== leadScore;
      const conversionRatesChanged = JSON.stringify(lead.conversionRates ?? {}) !== JSON.stringify(conversionRates);
      
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
