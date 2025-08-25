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
 * 
 * 3. Memory Management:
 *    - Cache size limits to prevent memory leaks
 *    - Early exit conditions in validation loops
 *    - Efficient date parsing with instanceof checks
 */

import fetch from "node-fetch";
import * as XLSX from "xlsx";
import { ILead, ILeadDocument, LeadStatus } from "../domain/leads.domain.js";
import LeadModel from "../repository/models/leads.model.js";
import { conversionRateRepository } from "../repository/repository.js";
import { IConversionRate } from "../repository/models/conversionRate.model.js";
import utils from "../../../utils/utils.js";

type LeadKeyField = keyof Pick<
  ILead,
  "service" | "adSetName" | "adName" | "leadDate" | "zip"
>;

type UniqueKey = {
  value: string;
  field: LeadKeyField;
};

export interface SkipReasons {
  missingName: number;
  missingService: number;
  missingAdSetName: number;
  missingAdName: number;
  invalidRowStructure: number;
  processingErrors: number;
  total: number;
}

export interface SheetProcessingResult {
  totalRowsInSheet: number;
  validLeadsProcessed: number;
  skippedRows: number;
  skipReasons: string[];
  leadsStoredInDB: number;
  duplicatesUpdated: number;
  newLeadsAdded: number;
  conversionRatesGenerated: number;
  processedSubSheet: string;
  availableSubSheets: string[];
  conversionRateInsights: {
    uniqueServices: string[];
    uniqueAdSets: string[];
    uniqueAdNames: string[];
    uniqueMonths: string[];
  };
};

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

      // 3. Upsert conversion rates to DB (no change detection for rates, but could be added if needed)
      await conversionRateRepository.batchUpsertConversionRates(conversionData);
      console.log(`[CR Update] Upserted conversion rates to DB for clientId: ${clientId}`);

      // 4. Build a lookup map for conversion rates for fast access
      const crMap: Record<string, Record<string, number>> = {
        service: {}, adSetName: {}, adName: {}, leadDate: {}, zip: {}
      };
      for (const cr of conversionData) {
        if (crMap[cr.keyField]) {
          crMap[cr.keyField][cr.keyName] = cr.conversionRate;
        }
      }

      // 5. For each lead, recalculate leadScore and store conversionRates
      const bulkOps = [];
      let actuallyUpdatedLeads = 0;
      for (const lead of leads) {
        // Build conversionRates object for this lead
        const conversionRatesForLead = {
          service: crMap.service[lead.service] ?? 0,
          adSetName: crMap.adSetName[lead.adSetName] ?? 0,
          adName: crMap.adName[lead.adName] ?? 0,
          leadDate: (() => {
            const monthName = new Date(lead.leadDate).toLocaleString("en-US", { month: "long" });
            return crMap.leadDate[monthName] ?? 0;
          })(),
          zip: crMap.zip[lead.zip ?? ""] ?? 0
        };
        // Calculate new leadScore
        const weightedScore =
          (conversionRatesForLead.service * LeadService.FIELD_WEIGHTS.service) +
          (conversionRatesForLead.adSetName * LeadService.FIELD_WEIGHTS.adSetName) +
          (conversionRatesForLead.adName * LeadService.FIELD_WEIGHTS.adName) +
          (conversionRatesForLead.leadDate * LeadService.FIELD_WEIGHTS.leadDate) +
          (conversionRatesForLead.zip * LeadService.FIELD_WEIGHTS.zip);
        let finalScore = Math.round(Math.max(0, Math.min(100, weightedScore / 100)));

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
        errors
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

  private static readonly FIELD_WEIGHTS = {
    service: 20,
    adSetName: 20, 
    adName: 20,
    leadDate: 20,
    zip: 20
  } as const;

  private calculateLeadScore(lead: ILead, conversionRates: IConversionRate[]): number {
    if (!conversionRates || conversionRates.length === 0) {
      return 0;
    }

    const serviceRate = this.getConversionRate(conversionRates, 'service', lead.service);
    const adSetRate = this.getConversionRate(conversionRates, 'adSetName', lead.adSetName);
    const adNameRate = this.getConversionRate(conversionRates, 'adName', lead.adName);
    const dateRate = this.getDateConversionRate(conversionRates, lead.leadDate);
    const zipRate = this.getConversionRate(conversionRates, 'zip', lead.zip || '');

    const weightedScore = 
      (serviceRate * LeadService.FIELD_WEIGHTS.service) +
      (adSetRate * LeadService.FIELD_WEIGHTS.adSetName) +
      (adNameRate * LeadService.FIELD_WEIGHTS.adName) +
      (dateRate * LeadService.FIELD_WEIGHTS.leadDate) +
      (zipRate * LeadService.FIELD_WEIGHTS.zip);

    let finalScore = weightedScore / 100;
    // Ensure score is between 0 and 100 and round to nearest integer
    finalScore = Math.round(Math.max(0, Math.min(100, finalScore)));
    
    return finalScore;
  }

  /**
   * Get conversion rate for specific field and value
   */
  private getConversionRate(conversionRates: IConversionRate[], field: string, value: string): number {
    if (!value || value.trim() === '') return 0; // Handle empty values
    
    const rate = conversionRates.find(
      cr => cr.keyField === field && cr.keyName === value
    );
    return rate?.conversionRate || 0;
  }

  /**
   * Get date-based conversion rate (monthly)
   */
  private getDateConversionRate(conversionRates: IConversionRate[], leadDate: string): number {
    const date = new Date(leadDate);
    const monthName = date.toLocaleString("en-US", { month: "long" });
    
    return this.getConversionRate(conversionRates, 'leadDate', monthName);
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

      // Calculate scores for leads without them
      const bulkOps = leadsWithoutScores.map(lead => {
        const leadScore = this.calculateLeadScore(lead, conversionRates);
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
          lead.leadScore = this.calculateLeadScore(lead, conversionRates);
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

      // Calculate new scores for all leads
      const bulkOps = allLeads.map(lead => {
        const leadScore = this.calculateLeadScore(lead, conversionRates);
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

  /**
   * Recalculate lead scores for ALL clients (batch operation)
   */
  public async recalculateAllLeadScoresForAllClients(): Promise<{
    processedClients: number;
    totalLeadsUpdated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let totalLeadsUpdated = 0;
    
    try {
      // Get all unique client IDs
      const clientIds = await this.getAllClientIds();
      console.log(`Starting lead score recalculation for ${clientIds.length} clients`);
      
      for (const clientId of clientIds) {
        try {
          const result = await this.recalculateAllLeadScores(clientId);
          totalLeadsUpdated += result.updatedLeads;
          errors.push(...result.errors);
        } catch (error: any) {
          const errorMsg = `Error processing client ${clientId}: ${error.message}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
      
      return {
        processedClients: clientIds.length,
        totalLeadsUpdated,
        errors
      };
    } catch (error: any) {
      const errorMsg = `Error in batch lead score recalculation: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      
      return {
        processedClients: 0,
        totalLeadsUpdated: 0,
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
      if (lead.zip && lead.zip.trim()) zipSet.add(lead.zip.trim()); // NEW: Add ZIP codes
      
      // Optimized month extraction
      if (lead.leadDate) {
        const monthName = this.getMonthlyName(lead.leadDate);
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
    leads: ILead[],
    clientId: string,
    keyName: string,
    keyField: LeadKeyField
  ) {
    // Pre-filter leads by clientId once for performance
    const clientLeads = leads.filter((lead) => lead.clientId === clientId);
    
    let totalForKey = 0;
    let yesForKey = 0;

    if (keyField === "leadDate") {
      const monthIndex = LeadService.monthMap[keyName.toLowerCase()];
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
    } else if (keyField === "zip") { // NEW: Handle ZIP code conversion rates
      // Single pass through leads for ZIP filtering
      for (const lead of clientLeads) {
        if (lead.zip && lead.zip.trim() === keyName) {
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

    const conversionRate = totalForKey === 0 ? 0 : 
      Math.floor((yesForKey / totalForKey) * 10000) / 100; // More precise rounding
      
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

    const allKeys = this.getUniqueFieldValues(leads);

    for (const { value: keyName, field: keyField } of allKeys) {
      const { conversionRate, pastTotalCount, pastTotalEst } =
        this.calculateConversionRate(leads, clientId, keyName, keyField);
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
    console.log(`Batch upserted ${upsertedRates.length} conversion rates for client ${clientId}`);
    
    // After updating conversion rates, recalculate lead scores for this client
    try {
      console.log(`Recalculating lead scores after conversion rate update for client ${clientId}`);
      const scoreUpdateResult = await this.recalculateAllLeadScores(clientId);
      console.log(`Updated ${scoreUpdateResult.updatedLeads} lead scores for client ${clientId}`);
    } catch (error: any) {
      console.error(`Error updating lead scores after conversion rate update for client ${clientId}:`, error);
    }
    
    return upsertedRates;
  }
  // ---------------- DATABASE OPERATIONS ----------------
  


  public async createLead(payload: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(payload);
  }

  // Bulk upsert leads with duplicate prevention
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
    
    // Return the upserted/updated documents
    const upsertedIds = Object.values(result.upsertedIds || {});
    const modifiedIds = Object.values(result.matchedCount ? 
      await LeadModel.find({
        clientId: { $in: payloads.map(p => p.clientId) },
        name: { $in: payloads.map(p => p.name) },
        service: { $in: payloads.map(p => p.service) }
      }).distinct('_id') : []);
    
    const allIds = [...upsertedIds, ...modifiedIds];
    const documents = await LeadModel.find({ _id: { $in: allIds } }).lean().exec();
    
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

  // ---------------- GOOGLE SHEETS FETCH ----------------
public async fetchLeadsFromSheet(
  sheetUrl: string,
  clientId: string
): Promise<{
  leads: ILead[];
  stats: {
    totalRowsInSheet: number;
    validLeadsProcessed: number;
    skippedRows: number;
    skipReasons: string[];
    processedSubSheet: string;
    availableSubSheets: string[];
  };
}> {
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheet URL");
  const sheetId = match[1];
  
  // Extract GID (sub-sheet ID) from URL if present
  const gidMatch = sheetUrl.match(/[?&#]gid=([0-9]+)/);
  let targetGid: string | null = gidMatch ? gidMatch[1] : null;
  
  console.log(`📊 Sheet ID: ${sheetId}${targetGid ? `, Target GID: ${targetGid}` : ' (default sheet)'}`);
  
  // Build export URL - if specific gid is provided, include it
  let url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  if (targetGid) {
    url += `&gid=${targetGid}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const buffer = await res.arrayBuffer();

  let data: any[] = [];
  let allHeaders: string[] = [];
  let targetSheetName: string = "Unknown";
  let availableSubSheets: string[] = [];
  
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    availableSubSheets = workbook.SheetNames;
    
    console.log(`📋 Available sub-sheets: ${availableSubSheets.join(', ')}`);
    
    // Determine which sheet to process
    if (targetGid) {
      // Find sheet by GID - when exporting with specific GID, it usually becomes the first (and only) sheet
      targetSheetName = availableSubSheets[0];
      console.log(`🎯 Processing sub-sheet with GID ${targetGid}: "${targetSheetName}"`);
    } else {
      // No specific GID - use first sheet
      targetSheetName = availableSubSheets[0];
      console.log(`🎯 Processing default sub-sheet: "${targetSheetName}"`);
    }
    
    const sheet = workbook.Sheets[targetSheetName];
    
    // First, extract ALL headers from the first row, including empty columns
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = sheet[cellAddress];
      const headerValue = cell ? XLSX.utils.format_cell(cell) : "";
      allHeaders.push(headerValue.trim()); // don't skip empty ones
    }

    console.log("All detected headers (including blanks):", allHeaders);

    
    // Now parse the data with all headers included, skipping the header row
    const sheetRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const dataRange = XLSX.utils.encode_range({
      s: { r: 1, c: sheetRange.s.c }, // Start from row 2 (index 1) to skip header
      e: { r: sheetRange.e.r, c: sheetRange.e.c }
    });
    
    data = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
      defval: "", // Default value for empty cells  
      blankrows: false, // Skip completely empty rows
      header: allHeaders, // Use our extracted headers
      range: dataRange // Skip the header row by starting from row 2
    });

    // Ensure all detected headers are present in each data row
    if (data.length > 0) {
      data = data.map(row => {
        const newRow = { ...row };
        // Add missing headers with empty values
        allHeaders.forEach(header => {
          if (!(header in newRow)) {
            newRow[header] = "";
          }
        });
        return newRow;
      });
    }

    console.log("Sheet parsing successful. Total rows parsed:", data.length);
    
    // Log final available columns
    if (data.length > 0) {
      console.log("Available columns:", Object.keys(data[0]));
    }
  } catch (error: any) {
    console.error("Error parsing sheet:", error);
    throw new Error(`Failed to parse sheet data: ${error.message}`);
  }

  // Check if data is empty
  if (!data || data.length === 0) {
    console.log("No data found in sheet");
    return {
      leads: [],
      stats: {
        totalRowsInSheet: 0,
        validLeadsProcessed: 0,
        skippedRows: 0,
        skipReasons: [],
        processedSubSheet: targetSheetName || "Unknown",
        availableSubSheets: availableSubSheets || []
      }
    };
  }

  // STRICT HEADER VALIDATION - All required headers must be present with exact names
  const requiredHeaders = [
    "Estimate Set (Yes/No)",
    "Lead Date", 
    "Name",
    "Email",
    "Phone", 
    "Zip",
    "Service",
    "Ad Set Name",
    "Ad Name", 
    "Unqualified Lead Reason"
  ];

  // Use the headers we extracted during parsing (includes empty columns)
  const availableHeaders = data.length > 0 ? Object.keys(data[0]) : allHeaders;

  const missingHeaders: string[] = [];
  
  // Check for missing required headers
  for (const requiredHeader of requiredHeaders) {
    if (!availableHeaders.includes(requiredHeader)) {
      missingHeaders.push(requiredHeader);
    }
  }

  // If any headers are missing, throw error before any processing
  if (missingHeaders.length > 0) {
    const errorMessage = `Missing required sheet headers: ${missingHeaders.join(', ')}. ` +
      `Available headers: ${availableHeaders.join(', ')}. ` +
      `Please ensure your sheet has exactly these headers: ${requiredHeaders.join(', ')}`;
    console.error("Header validation failed:", errorMessage);
    throw new Error(errorMessage);
  }

  // Pre-allocate arrays for better performance with large datasets
  const validLeads: ILead[] = [];
  
  // Track detailed skip reasons
  const skipReasons: SkipReasons = {
    missingName: 0,
    missingService: 0,
    missingAdSetName: 0,
    missingAdName: 0,
    invalidRowStructure: 0,
    processingErrors: 0,
    total: 0
  };
  
  // Single pass through data for optimal performance
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const sheetRowNumber = i + 2; // Actual sheet row (i + 2 because i is 0-based and we skip header row)
    
    // Quick validation checks - exit early on invalid rows
    if (!row || typeof row !== 'object') {
      skipReasons.invalidRowStructure++;
      skipReasons.total++;
      console.warn(`⚠️  Sheet Row ${sheetRowNumber}: Invalid row structure - skipping`);
      continue;
    }
    
    // Lead validation: Check each required business field individually
    const hasName = row["Name"] && String(row["Name"]).trim();
    const hasService = row["Service"] && String(row["Service"]).trim();
    const hasAdSetName = row["Ad Set Name"] && String(row["Ad Set Name"]).trim();
    const hasAdName = row["Ad Name"] && String(row["Ad Name"]).trim();
    
    // Track specific missing fields
    let shouldSkip = false;
    const leadName = hasName ? String(row["Name"]).trim() : "Unknown";
    
    if (!hasName) {
      skipReasons.missingName++;
      skipReasons.total++;
      shouldSkip = true;
      console.warn(`⚠️  Sheet Row ${sheetRowNumber}: Missing Name - skipping`);
    }
    
    if (!hasService) {
      skipReasons.missingService++;
      if (!shouldSkip) skipReasons.total++;
      shouldSkip = true;
      console.warn(`⚠️  Sheet Row ${sheetRowNumber}: Missing Service for lead "${leadName}" - skipping`);
    }
    
    if (!hasAdSetName) {
      skipReasons.missingAdSetName++;
      if (!shouldSkip) skipReasons.total++;
      shouldSkip = true;
      console.warn(`⚠️  Sheet Row ${sheetRowNumber}: Missing Ad Set Name for lead "${leadName}" - skipping`);
    }
    
    if (!hasAdName) {
      skipReasons.missingAdName++;
      if (!shouldSkip) skipReasons.total++;
      shouldSkip = true;
      console.warn(`⚠️  Sheet Row ${sheetRowNumber}: Missing Ad Name for lead "${leadName}" - skipping`);
    }
    
    if (shouldSkip) {
      continue;
    }
    
    try {
      // Strict header name usage - exact match required
      const estimateSetValue = row["Estimate Set (Yes/No)"];
      const isEstimateSet = estimateSetValue === true || 
        estimateSetValue === 1 ||
        (typeof estimateSetValue === "string" && estimateSetValue.trim().toUpperCase() === "TRUE") ||
        (typeof estimateSetValue === "string" && estimateSetValue.trim().toUpperCase() === "YES");

      const status: LeadStatus = isEstimateSet ? 'estimate_set' : 'unqualified';
      const unqualifiedLeadReason = isEstimateSet ? '' : String(row["Unqualified Lead Reason"] || "");

      // Parse date using utility helper function
      const leadDate = utils.parseDate(row["Lead Date"], sheetRowNumber);
      console.log(`Processing Sheet Row ${sheetRowNumber}, email:`, row["Email"]);
      validLeads.push({
        status,
        leadDate,
        name: String(row["Name"] || ""),
        email: String(row["Email"] || ""),
        phone: String(row["Phone"] || ""),
        zip: String(row["Zip"] || ""),
        service: String(row["Service"] || ""),
        adSetName: String(row["Ad Set Name"] || ""),
        adName: String(row["Ad Name"] || ""),
        unqualifiedLeadReason,
        clientId,
      } as ILead);
    } catch (error) {
      skipReasons.processingErrors++;
      skipReasons.total++;
      const leadName = row["Name"] ? String(row["Name"]).trim() : "Unknown";
      console.error(`❌ Error processing Sheet Row ${sheetRowNumber} (Lead: "${leadName}"):`, error);
    }
  }

  // Log detailed skip summary
  if (skipReasons.total > 0) {
    console.log(`✅ Processed ${validLeads.length} valid leads, ❌ skipped ${skipReasons.total} rows:`);
    if (skipReasons.missingName > 0) console.log(`  - ${skipReasons.missingName} rows missing Name`);
    if (skipReasons.missingService > 0) console.log(`  - ${skipReasons.missingService} rows missing Service`);
    if (skipReasons.missingAdSetName > 0) console.log(`  - ${skipReasons.missingAdSetName} rows missing Ad Set Name`);
    if (skipReasons.missingAdName > 0) console.log(`  - ${skipReasons.missingAdName} rows missing Ad Name`);
    if (skipReasons.invalidRowStructure > 0) console.log(`  - ${skipReasons.invalidRowStructure} rows with invalid structure`);
    if (skipReasons.processingErrors > 0) console.log(`  - ${skipReasons.processingErrors} rows with processing errors`);
  } else {
    console.log(`✅ Successfully processed all ${validLeads.length} leads from sheet`);
  }

  // Convert skipReasons to breakdown array
  const skipReasonsBreakdown: string[] = [
    ...(skipReasons.missingName > 0 ? [`${skipReasons.missingName} rows missing Name`] : []),
    ...(skipReasons.missingService > 0 ? [`${skipReasons.missingService} rows missing Service`] : []),
    ...(skipReasons.missingAdSetName > 0 ? [`${skipReasons.missingAdSetName} rows missing Ad Set Name`] : []),
    ...(skipReasons.missingAdName > 0 ? [`${skipReasons.missingAdName} rows missing Ad Name`] : []),
    ...(skipReasons.invalidRowStructure > 0 ? [`${skipReasons.invalidRowStructure} rows with invalid structure`] : []),
    ...(skipReasons.processingErrors > 0 ? [`${skipReasons.processingErrors} rows with processing errors`] : [])
  ];

  return {
    leads: validLeads,
    stats: {
      totalRowsInSheet: data.length,
      validLeadsProcessed: validLeads.length,
      skippedRows: skipReasons.total,
      skipReasons: skipReasonsBreakdown,
      processedSubSheet: targetSheetName,
      availableSubSheets: availableSubSheets
    }
  };
}

  // ---------------- COMPREHENSIVE SHEET PROCESSING ----------------
  public async processCompleteSheet(sheetUrl: string, clientId: string): Promise<{
    result: SheetProcessingResult;
    conversionData: any[];
  }> {
    // 1. Fetch and parse leads from sheet
    const sheetResult = await this.fetchLeadsFromSheet(sheetUrl, clientId);
    const { leads, stats: sheetStats } = sheetResult;
    
    // 2. Bulk upsert leads to database
    const bulkResult = await this.bulkCreateLeads(leads);
    
    // 3. Process leads for conversion rates
    const conversionData = await this.processLeads(leads, clientId);
    
    // 4. Extract insights from conversion data
    const conversionRateInsights = {
      uniqueServices: [...new Set(conversionData.filter(d => d.keyField === 'service').map(d => d.keyName))],
      uniqueAdSets: [...new Set(conversionData.filter(d => d.keyField === 'adSetName').map(d => d.keyName))],
      uniqueAdNames: [...new Set(conversionData.filter(d => d.keyField === 'adName').map(d => d.keyName))],
      uniqueMonths: [...new Set(conversionData.filter(d => d.keyField === 'leadDate').map(d => d.keyName))]
    };
    
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
  // Cache for month name lookups to avoid repeated date parsing
  private monthNameCache = new Map<string, string | null>();
  
  private getMonthlyName(dateStr: string): string | null {
    // Check cache first for performance
    if (this.monthNameCache.has(dateStr)) {
      return this.monthNameCache.get(dateStr)!;
    }
    
    const d = new Date(dateStr);
    const result = isNaN(d.getTime()) ? null : d.toLocaleString("en-US", { month: "long" });
    
    // Cache the result to avoid repeated calculations
    this.monthNameCache.set(dateStr, result);
    
    // Clear cache if it gets too large to prevent memory leaks
    if (this.monthNameCache.size > 1000) {
      this.monthNameCache.clear();
      this.monthNameCache.set(dateStr, result);
    }
    
    return result;
  }

  // Static month map for better performance
  private static readonly monthMap: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  /**
   * Get all unique client IDs from leads collection
   */
  public async getAllClientIds(): Promise<string[]> {
    const clientIds = await LeadModel.distinct("clientId").exec();
    return clientIds.filter(id => id); // Remove any null/undefined values
  }

  /**
   * Update conversion rates by adding new weekly data to existing data
   * Now uses batch operations for better performance
   */

  /**
   * Process weekly conversion rate updates for all clients
   */
  public async processWeeklyConversionRateUpdates(): Promise<{
    processedClients: number;
    totalUpdatedRates: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let totalUpdatedRates = 0;

    try {
      // Get all client IDs
      const clientIds = await this.getAllClientIds();
      console.log(`Processing weekly updates for ${clientIds.length} clients`);

      // Calculate date range for the past week
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = today.toISOString().split('T')[0];

      console.log(`Processing leads from ${weekStartStr} to ${weekEndStr}`);

      for (const clientId of clientIds) {
        try {
          // Use existing getLeads function instead of duplicate getWeeklyLeads
          const weeklyLeads = await this.getLeads(clientId, weekStartStr, weekEndStr);
          
          if (weeklyLeads.length === 0) {
            console.log(`No leads found for client ${clientId} in the past week`);
            continue;
          }

          console.log(`Processing ${weeklyLeads.length} leads for client ${clientId}`);

          // Update conversion rates with weekly data using batch operations
          const updatedRates = await this.updateConversionRatesWithWeeklyData(clientId, weeklyLeads);
          totalUpdatedRates += updatedRates.length;

          console.log(`Batch updated ${updatedRates.length} conversion rates for client ${clientId}`);
        } catch (error: any) {
          const errorMsg = `Error processing client ${clientId}: ${error.message}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return {
        processedClients: clientIds.length,
        totalUpdatedRates,
        errors
      };
    } catch (error: any) {
      const errorMsg = `Error in weekly conversion rate update process: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      
      return {
        processedClients: 0,
        totalUpdatedRates: 0,
        errors
      };
    }
  }
}
