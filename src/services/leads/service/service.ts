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

type LeadKeyField = keyof Pick<
  ILead,
  "service" | "adSetName" | "adName" | "leadDate"
>;

type UniqueKey = {
  value: string;
  field: LeadKeyField;
};

export class LeadService {
  // ---------------- DATABASE OPERATIONS ----------------
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

    // Optimized query with proper sorting for index usage
    // Note: Ensure compound indexes exist on {clientId: 1, leadDate: 1} for optimal performance
    return await LeadModel.find(query)
      .sort({ leadDate: 1, _id: 1 }) // Consistent sorting for performance
      .lean() // Return plain JS objects instead of Mongoose documents for better performance
      .exec();
  }


  public async createLead(payload: ILead): Promise<ILeadDocument> {
    return await LeadModel.create(payload);
  }

  // Bulk insert leads
  public async bulkCreateLeads(payloads: ILead[]): Promise<ILeadDocument[]> {
    return await LeadModel.insertMany(payloads);
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
): Promise<ILead[]> {
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheet URL");
  const sheetId = match[1];
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const buffer = await res.arrayBuffer();

  let data: any[] = [];
  
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
    });

    console.log("Sheet parsing successful. First row:", data[0]);
    console.log("Total rows parsed:", data.length);
    
    // Log column headers to debug mapping issues
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
    return [];
  }

  // Pre-allocate arrays for better performance with large datasets
  const validLeads: ILead[] = [];
  const skippedRows: number[] = [];
  
  // Single pass through data for optimal performance
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Quick validation checks - exit early on invalid rows
    if (!row || typeof row !== 'object') {
      skippedRows.push(i);
      continue;
    }
    
    const hasIdentifier = row["Name"] || row["Email"];
    const hasService = row["Service"];
    const hasAdInfo = row["Ad Set Name"] && row["Ad Name"];
    
    if (!hasIdentifier || !hasService || !hasAdInfo) {
      skippedRows.push(i);
      continue;
    }
    
    try {
      // Optimized status determination logic
      const estimateSetValue = row["Estimate Set"];
      const isEstimateSet = estimateSetValue === true || 
        estimateSetValue === 1 ||
        (typeof estimateSetValue === "string" && estimateSetValue.trim().toUpperCase() === "TRUE");

      const status: LeadStatus = isEstimateSet ? 'estimate_set' : 'unqualified';
      const unqualifiedLeadReason = isEstimateSet ? '' : String(row["Unqualified Lead Reason"] || "");

      // Optimized date parsing - avoid creating Date object if not needed
      let leadDate = "";
      if (row["Lead Date"]) {
        const dateValue = row["Lead Date"];
        leadDate = dateValue instanceof Date ? 
          dateValue.toISOString().slice(0, 10) :
          new Date(dateValue).toISOString().slice(0, 10);
      }

      validLeads.push({
        _id: null,
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
      console.error(`Error processing row ${i}:`, error);
      skippedRows.push(i);
    }
  }

  if (skippedRows.length > 0) {
    console.log(`Processed ${validLeads.length} valid leads, skipped ${skippedRows.length} invalid rows`);
  }

  return validLeads;
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

  private getUniqueFieldValues(leads: ILead[]): UniqueKey[] {
    // Use Maps for better performance with large datasets
    const serviceSet = new Set<string>();
    const adSetNameSet = new Set<string>();
    const adNameSet = new Set<string>();
    const monthSet = new Set<string>();
    
    // Single pass through leads array for optimal performance
    for (const lead of leads) {
      if (lead.service) serviceSet.add(lead.service);
      if (lead.adSetName) adSetNameSet.add(lead.adSetName);
      if (lead.adName) adNameSet.add(lead.adName);
      
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

  // ---------------- WEEKLY UPDATE FUNCTIONS ----------------

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

    // Batch upsert all conversion rates at once - much more efficient!
    const upsertedRates = await conversionRateRepository.batchUpsertConversionRates(ratesToUpsert);
    console.log(`Batch upserted ${upsertedRates.length} conversion rates for client ${clientId}`);
    
    return upsertedRates;
  }

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
