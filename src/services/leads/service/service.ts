/*
 * PERFORMANCE OPTIMIZATIONS IMPLEMENTED:
 * 
 * 1. Batch Database Operations:
 *    - Replaced individual findOneAndUpdate with bulk operations
 *    - Used bulkWrite for conversion rate upserts
 *    - Added .lean() queries for better memory usage
 * 
 * 2. Processing Optimizations:
 *    - Single-pass filtering instead of filter + map chains
 *    - Pre-allocated arrays and Sets for unique value collection
 *    - Cached month name parsing with automatic cleanup
 *    - Static month mapping for lookup performance
 *    - Map-based conversion rate lookups (O(1) vs O(n))
 *    - Eliminated duplicate calculateLeadScore methods
 * 
 * 3. Memory Management:
 *    - Cache size limits to prevent memory leaks
 *    - Early exit conditions in validation loops
 *    - Efficient date parsing with instanceof checks
 *    - Removed expensive document retrieval from bulkCreateLeads
 * 
 * 4. RECOMMENDED DATABASE INDEXES:
 *    - LeadModel: { clientId: 1, leadDate: 1 } (for date range queries)
 *    - LeadModel: { clientId: 1, service: 1, adSetName: 1, adName: 1 } (for conversion calculations)
 *    - LeadModel: { clientId: 1, name: 1, email: 1, phone: 1, leadDate: 1 } (for duplicate detection)
 *    - ConversionRateModel: { clientId: 1, keyField: 1, keyName: 1 } (for rate lookups)
 */

import { ILead, ILeadDocument, LeadStatus } from "../domain/leads.domain.js";
import LeadModel from "../repository/models/leads.model.js";
import { conversionRateRepository } from "../repository/repository.js";
import { IConversionRate } from "../repository/models/conversionRate.model.js";
import {
  FIELD_WEIGHTS,
  getMonthlyName,
  createConversionRatesMap,
  getConversionRateFromMap,
  calculateLeadScore,
  getMonthIndex,
  type LeadKeyField,
  type UniqueKey
} from "../utils/leads.util.js";
import { SheetsService, type SheetProcessingResult } from "./sheets.service.js";

// Types moved to leads.util.ts and sheets.service.ts for better organization

// Re-export SheetProcessingResult from sheets service for backward compatibility
export type { SheetProcessingResult } from "./sheets.service.js";

export class LeadService {
  /**
   * Update conversion rates and lead scores for all leads of a client.
   * - Calculates conversion rates for all 5 fields (service, adSetName, adName, leadDate, zip)
   * - Upserts conversion rates to DB
   * - Recalculates lead scores for all leads
   * - Stores conversion rates for each lead in a new field 'conversionRates'
   *
   * @param clientId - The client ID to process
   * @returns Summary of update operation
   */
  public async updateConversionRatesAndLeadScoresForClient(clientId: string): Promise<{
    updatedConversionRates: number;
    updatedLeads: number;
    errors: string[];
    conversionRateStats?: {
      newInserts: number;
      updated: number;
    };
  }> {
    const errors: string[] = [];
    try {
      console.log(`[CR Update] Starting update for clientId: ${clientId}`);
      // 1. Fetch all leads for client
      const leads = await LeadModel.find({ clientId }).lean().exec();
      if (leads.length === 0) {
        console.log(`[CR Update] No leads found for clientId: ${clientId}`);
        return { updatedConversionRates: 0, updatedLeads: 0, errors: [] };
      }

      // 2. Calculate conversion rates for all unique fields
      const conversionData = this.processLeads(leads, clientId);
      console.log(`[CR Update] Calculated ${conversionData.length} conversion rates for clientId: ${clientId}`);

      // 3. Upsert conversion rates to DB
      const crUpsertResult = await conversionRateRepository.batchUpsertConversionRates(conversionData);
      console.log(`[CR Update] Upserted conversion rates to DB for clientId: ${clientId} - New: ${crUpsertResult.stats.newInserts}, Updated: ${crUpsertResult.stats.updated}`);

      // 4. Fetch conversion rates from DB for this client
      const dbConversionRates = await conversionRateRepository.getConversionRates({ clientId });

      // 5. For each lead, recalculate leadScore and store conversionRates (always use DB values)
      // OPTIMIZATION: Create conversion rates map for O(1) lookups instead of O(n) array searches
      const conversionRatesMap = createConversionRatesMap(dbConversionRates);
      
      const bulkOps = [];
      let actuallyUpdatedLeads = 0;
      for (const lead of leads) {
        // Get conversion rates for each field from DB using efficient Map lookups
        const serviceRate = getConversionRateFromMap(conversionRatesMap, 'service', lead.service);
        const adSetNameRate = getConversionRateFromMap(conversionRatesMap, 'adSetName', lead.adSetName);
        const adNameRate = getConversionRateFromMap(conversionRatesMap, 'adName', lead.adName);
        const monthName = new Date(lead.leadDate).toLocaleString("en-US", { month: "long" });
        const leadDateRate = getConversionRateFromMap(conversionRatesMap, 'leadDate', monthName);
        const zipRate = getConversionRateFromMap(conversionRatesMap, 'zip', lead.zip ?? "");

        // Build conversionRates object for this lead (always include all fields)
        const conversionRatesForLead = {
          service: serviceRate,
          adSetName: adSetNameRate,
          adName: adNameRate,
          leadDate: leadDateRate,
          zip: zipRate
        };

        // Calculate new leadScore using all fields, even if 0
        const weightedScore =
          (serviceRate * FIELD_WEIGHTS.service) +
          (adSetNameRate * FIELD_WEIGHTS.adSetName) +
          (adNameRate * FIELD_WEIGHTS.adName) +
          (leadDateRate * FIELD_WEIGHTS.leadDate) +
          (zipRate * FIELD_WEIGHTS.zip);
        // Score is between 0 and 100, multiply by 100 before rounding
        let finalScore = Math.round(Math.max(0, Math.min(100, weightedScore)));

        // Only update if leadScore or conversionRates have changed
        const leadScoreChanged = lead.leadScore !== finalScore;
        const conversionRatesChanged = JSON.stringify(lead.conversionRates ?? {}) !== JSON.stringify(conversionRatesForLead);
        if (leadScoreChanged || conversionRatesChanged) {
          bulkOps.push({
            updateOne: {
              filter: { _id: lead._id },
              update: {
                $set: {
                  leadScore: finalScore,
                  conversionRates: conversionRatesForLead
                }
              }
            }
          });
          actuallyUpdatedLeads++;
        }
      }

      // 6. Bulk update only changed leads
      let modifiedCount = 0;
      if (bulkOps.length > 0) {
        const result = await LeadModel.bulkWrite(bulkOps);
        modifiedCount = result.modifiedCount;
        console.log(`[CR Update] Updated ${modifiedCount} leads with new scores and conversionRates for clientId: ${clientId}`);
      } else {
        console.log(`[CR Update] No leads needed updating for clientId: ${clientId}`);
      }

      return {
        updatedConversionRates: conversionData.length,
        updatedLeads: actuallyUpdatedLeads,
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
        errors
      };
    }
  }

  /**
   * Calculate and store lead scores for leads that don't have them
   */
  private async calculateAndStoreMissingLeadScores(
    leads: ILeadDocument[], 
    clientId: string
  ): Promise<ILeadDocument[]> {
    // Find leads without lead scores
    const leadsWithoutScores = leads.filter(lead => 
      typeof lead.leadScore === 'undefined' || lead.leadScore === null
    );

    if (leadsWithoutScores.length === 0) {
      console.log(`All leads already have lead scores for client ${clientId}`);
      return leads;
    }

    console.log(`Calculating lead scores for ${leadsWithoutScores.length} leads for client ${clientId}`);

    try {
      // Get conversion rates for this client
      const conversionRates = await conversionRateRepository.getConversionRates({ clientId });
      
      if (conversionRates.length === 0) {
        console.log(`No conversion rates found for client ${clientId}, setting lead scores to 0`);
        
        // Set all scores to 0 if no conversion rates exist
        const bulkOps = leadsWithoutScores.map(lead => ({
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: { leadScore: 0 } }
          }
        }));

        await LeadModel.bulkWrite(bulkOps);
        
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
      await LeadModel.bulkWrite(bulkOps);
      console.log(`Updated lead scores for ${bulkOps.length} leads`);

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

  /**
   * Recalculate ALL lead scores for a specific client (manual update function)
   */
  public async recalculateAllLeadScores(clientId: string): Promise<{
    totalLeads: number;
    updatedLeads: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      console.log(`Starting lead score recalculation for client ${clientId}`);
      
      // Get all leads for this client
      const allLeads = await LeadModel.find({ clientId }).lean().exec();
      
      if (allLeads.length === 0) {
        return {
          totalLeads: 0,
          updatedLeads: 0,
          errors: [`No leads found for client ${clientId}`]
        };
      }

      // Get conversion rates for this client  
      const conversionRates = await conversionRateRepository.getConversionRates({ clientId });
      
      if (conversionRates.length === 0) {
        console.log(`No conversion rates found for client ${clientId}, setting all lead scores to 0`);
        
        await LeadModel.updateMany(
          { clientId },
          { $set: { leadScore: 0 } }
        );
        
        return {
          totalLeads: allLeads.length,
          updatedLeads: allLeads.length,
          errors: []
        };
      }

      // Create conversion rates map for efficient lookups
      const conversionRatesMap = createConversionRatesMap(conversionRates);

      // Calculate new scores for all leads
      const bulkOps = allLeads.map(lead => {
        const leadScore = calculateLeadScore(lead, conversionRatesMap);
        return {
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: { leadScore } }
          }
        };
      });

      // Bulk update all lead scores
      const result = await LeadModel.bulkWrite(bulkOps);
      console.log(`Recalculated lead scores for ${result.modifiedCount} leads for client ${clientId}`);

      return {
        totalLeads: allLeads.length,
        updatedLeads: result.modifiedCount,
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

  // ---------------- UPDATED DATABASE OPERATIONS ----------------
  
  public async getLeads(
    clientId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ILeadDocument[]> {
    const query: any = {};
    if (clientId) query.clientId = clientId;
    if (startDate && endDate)
      query.leadDate = { $gte: startDate, $lte: endDate };
    else if (startDate) query.leadDate = { $gte: startDate };
    else if (endDate) query.leadDate = { $lte: endDate };

    // Get leads with optimized query
    const leads = await LeadModel.find(query)
      .sort({ leadDate: 1, _id: 1 })
      .lean()
      .exec();

    // Calculate and store missing lead scores automatically
    if (clientId) {
      return await this.calculateAndStoreMissingLeadScores(leads as ILeadDocument[], clientId);
    }
    
    return leads as ILeadDocument[];
  }

  // ---------------- UPDATED PROCESSING FUNCTIONS ----------------
  
  private getUniqueFieldValues(leads: ILead[]): UniqueKey[] {
    // Use Maps for better performance with large datasets
    const serviceSet = new Set<string>();
    const adSetNameSet = new Set<string>();
    const adNameSet = new Set<string>();
    const monthSet = new Set<string>();
    const zipSet = new Set<string>(); // NEW: ZIP code set

    // Single pass through leads array for optimal performance
    for (const lead of leads) {
      if (lead.service) serviceSet.add(lead.service);
      if (lead.adSetName) adSetNameSet.add(lead.adSetName);
      if (lead.adName) adNameSet.add(lead.adName);
      if (lead.zip && typeof lead.zip === 'string' && lead.zip.trim()) zipSet.add(lead.zip.trim()); // NEW: Add ZIP codes
      
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
    zipSet.forEach(zip => result.push({ value: zip, field: "zip" })); // NEW: Add ZIP field

    return result;
  }

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
        if (lead.zip && typeof lead.zip === 'string' && lead.zip.trim() === keyName) {
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

  public processLeads(leads: ILead[], clientId: string) {
    const result: {
      clientId: string;
      keyName: string;
      keyField: LeadKeyField;
      conversionRate: number;
      pastTotalCount: number;
      pastTotalEst: number;
    }[] = [];

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

  // ---------------- UPDATED WEEKLY UPDATE FUNCTIONS ----------------
  
  /**
   * Update conversion rates and recalculate lead scores for affected leads
   */
  public async updateConversionRatesWithWeeklyData(
    clientId: string, 
    weeklyLeads: ILead[]
  ): Promise<IConversionRate[]> {
    // Process new weekly leads to get new conversion data
    const newWeeklyData = this.processLeads(weeklyLeads, clientId);
    
    if (newWeeklyData.length === 0) {
      console.log(`No conversion data to process for client ${clientId}`);
      return [];
    }
    
    // Get existing conversion rates for this client
    const existingRates = await conversionRateRepository.getConversionRates({ clientId });
    
    const ratesToUpsert: IConversionRate[] = [];

    for (const newData of newWeeklyData) {
      // Find existing rate for this key combination
      const existingRate = existingRates.find(
        rate => rate.keyField === newData.keyField && rate.keyName === newData.keyName
      );

      let updatedRate: IConversionRate;

      if (existingRate) {
        // Update existing rate with new weekly data
        const totalCount = existingRate.pastTotalCount + newData.pastTotalCount;
        const totalEst = existingRate.pastTotalEst + newData.pastTotalEst;
        const conversionRate = Math.floor((totalCount === 0 ? 0 : totalEst / totalCount) * 100) / 100;

        updatedRate = {
          clientId,
          keyName: newData.keyName,
          keyField: newData.keyField,
          conversionRate,
          pastTotalCount: totalCount,
          pastTotalEst: totalEst
        };
      } else {
        // Create new rate if it doesn't exist
        updatedRate = {
          clientId: newData.clientId,
          keyName: newData.keyName,
          keyField: newData.keyField,
          conversionRate: newData.conversionRate,
          pastTotalCount: newData.pastTotalCount,
          pastTotalEst: newData.pastTotalEst
        };
      }

      ratesToUpsert.push(updatedRate);
    }

    // Batch upsert all conversion rates at once
    const upsertedRates = await conversionRateRepository.batchUpsertConversionRates(ratesToUpsert);
    console.log(`Batch upserted ${upsertedRates.documents.length} conversion rates for client ${clientId} - New: ${upsertedRates.stats.newInserts}, Updated: ${upsertedRates.stats.updated}`);
    
    // After updating conversion rates, recalculate lead scores for this client
    try {
      console.log(`Recalculating lead scores after conversion rate update for client ${clientId}`);
      const scoreUpdateResult = await this.recalculateAllLeadScores(clientId);
      console.log(`Updated ${scoreUpdateResult.updatedLeads} lead scores for client ${clientId}`);
    } catch (error: any) {
      console.error(`Error updating lead scores after conversion rate update for client ${clientId}:`, error);
    }
    
    return upsertedRates.documents;
  }
  // ---------------- DATABASE OPERATIONS ----------------
  


  public async createLead(payload: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(payload);
  }

  // Bulk upsert leads with duplicate prevention - OPTIMIZED
  public async bulkCreateLeads(payloads: ILead[]): Promise<{
    documents: ILeadDocument[];
    stats: {
      total: number;
      newInserts: number;
      duplicatesUpdated: number;
    };
  }> {
    if (payloads.length === 0) return { 
      documents: [], 
      stats: { total: 0, newInserts: 0, duplicatesUpdated: 0 }
    };

    // Use bulkWrite for upsert operations to prevent duplicates
    const bulkOps = payloads.map(lead => ({
      updateOne: {
        filter: {
          clientId: lead.clientId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          service: lead.service,
          adSetName: lead.adSetName,
          adName: lead.adName,
          leadDate: lead.leadDate
        },
        update: { $set: lead },
        upsert: true // Insert if not exists, update if exists
      }
    }));

    const result = await LeadModel.bulkWrite(bulkOps, { ordered: false });
    
    // Get statistics from bulkWrite result
    const newInserts = result.upsertedCount || 0;
    const duplicatesUpdated = result.modifiedCount || 0;
    const total = newInserts + duplicatesUpdated;
    
    // OPTIMIZATION: Only fetch documents if they're actually needed
    // Most callers only need the stats, not the full documents
    // If documents are needed, caller can fetch them separately with specific fields
    const documents: ILeadDocument[] = []; // Return empty array to avoid expensive query
    
    return {
      documents,
      stats: {
        total,
        newInserts,
        duplicatesUpdated
      }
    };
  }

  public async updateLead(
    id: string,
    data: Partial<Pick<ILead, "status" | "unqualifiedLeadReason">>
  ): Promise<ILeadDocument> {
    const existing = await LeadModel.findById(id);
    if (!existing) throw new Error("Lead not found");

    if (typeof data.status !== "undefined") {
      existing.status = data.status;
      // Clear unqualifiedLeadReason if status is not "unqualified"
      if (data.status !== 'unqualified') {
        existing.unqualifiedLeadReason = '';
      }
    }

    if (typeof data.unqualifiedLeadReason !== "undefined") {
      existing.unqualifiedLeadReason = data.unqualifiedLeadReason;
    }

    await existing.save();
    return existing;
  }

  // ---- COMPREHENSIVE SHEET PROCESSING - OPTIMIZED -----
  public async processCompleteSheet(sheetUrl: string, clientId: string): Promise<{
    result: SheetProcessingResult;
    conversionData: any[];
  }> {
    // Initialize sheets service
    const sheetsService = new SheetsService();
    
    // 1. Process sheet data (fetch, parse, extract insights)
    const sheetData = await sheetsService.processSheetData(sheetUrl, clientId);
    const { leads, stats: sheetStats, conversionRateInsights } = sheetData;
    
    // 2. Bulk upsert leads to database
    const bulkResult = await this.bulkCreateLeads(leads);
    
    // 3. Process leads for conversion rates
    const conversionData = this.processLeads(leads, clientId);
    
    // 4. Build comprehensive result
    const result: SheetProcessingResult = {
      totalRowsInSheet: sheetStats.totalRowsInSheet,
      validLeadsProcessed: sheetStats.validLeadsProcessed,
      skippedRows: sheetStats.skippedRows,
      skipReasons: sheetStats.skipReasons,
      leadsStoredInDB: bulkResult.stats.total,
      duplicatesUpdated: bulkResult.stats.duplicatesUpdated,
      newLeadsAdded: bulkResult.stats.newInserts,
      conversionRatesGenerated: conversionData.length,
      processedSubSheet: sheetStats.processedSubSheet,
      availableSubSheets: sheetStats.availableSubSheets,
      conversionRateInsights
    };

    return {
      result,
      conversionData
    };
  }

  // ---------------- PROCESSING FUNCTIONS ----------------
  // Utility functions moved to leads.util.ts

  /**
   * Get all unique client IDs from leads collection
   */
  public async getAllClientIds(): Promise<string[]> {
    const clientIds = await LeadModel.distinct("clientId").exec();
    return clientIds.filter(id => id); // Remove any null/undefined values
  }
}
