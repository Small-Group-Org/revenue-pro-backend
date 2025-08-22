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

export interface SheetProcessingResult {
  totalRowsInSheet: number;
  validLeadsProcessed: number;
  skippedRows: number;
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

    
    // Now parse the data with all headers included
    data = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
      defval: "", // Default value for empty cells  
      blankrows: false, // Skip completely empty rows
      header: allHeaders // Use first row as headers
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
  const skippedRows: number[] = [];
  
  // Single pass through data for optimal performance
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Quick validation checks - exit early on invalid rows
    if (!row || typeof row !== 'object') {
      skippedRows.push(i);
      continue;
    }
    
    // Lead validation: Must have required business fields (name is always required for identification)
    const hasName = row["Name"] && String(row["Name"]).trim();
    const hasService = row["Service"] && String(row["Service"]).trim();
    const hasAdInfo = row["Ad Set Name"] && row["Ad Name"] && 
                      String(row["Ad Set Name"]).trim() && String(row["Ad Name"]).trim();
    
    if (!hasName || !hasService || !hasAdInfo) {
      skippedRows.push(i);
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

      // Optimized date parsing - avoid creating Date object if not needed
      let leadDate = "";
      if (row["Lead Date"]) {
        const dateValue = row["Lead Date"];
        leadDate = dateValue instanceof Date ? 
          dateValue.toISOString().slice(0, 10) :
          new Date(dateValue).toISOString().slice(0, 10);
      }

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
      console.error(`Error processing row ${i}:`, error);
      skippedRows.push(i);
    }
  }

  if (skippedRows.length > 0) {
    console.log(`Processed ${validLeads.length} valid leads, skipped ${skippedRows.length} invalid rows`);
  }

  return {
    leads: validLeads,
    stats: {
      totalRowsInSheet: data.length,
      validLeadsProcessed: validLeads.length,
      skippedRows: skippedRows.length,
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
