import fetch from "node-fetch";
import * as XLSX from "xlsx";
import { ILead, LeadStatus } from "../domain/leads.domain.js";
import { getMonthlyName, sanitizeLeadData, generateLeadLookupKey } from "../utils/leads.util.js";
import { 
  parseEstimateSetValue,
  validateSheetHeaders,
  getRequiredSheetHeaders,
  validateSheetUrl,
  extractSheetId,
  extractGid,
  mapSheetRowToLead
} from "../utils/sheet.util.js";
import utils from "../../../utils/utils.js";
// Note: LeadService import removed to avoid circular dependency
// We'll use dependency injection instead

/**
 * Normalize leads for sheet processing - handle status, unqualified reasons, and preserve existing data
 */
const normalizeLeadsFromSheet = (leads: ILead[], existingLeads: Map<string, ILead>): ILead[] => {
  return leads.map((lead) => {
    const isEstimateSet = lead.status === "estimate_set";
    const hasUnqualifiedReason =
      lead.unqualifiedLeadReason && lead.unqualifiedLeadReason.trim() !== "";

    // Check if this lead already exists in DB
    const key = generateLeadLookupKey(lead);
    const existing = existingLeads.get(key);

    // For existing leads, preserve the original leadDate
    if (existing) {
      lead.leadDate = existing.leadDate;
    }

    if (!isEstimateSet && !hasUnqualifiedReason) {
      // For existing leads, preserve the original status
      if (existing) {
        return { 
          ...lead, 
          status: existing.status
        };
      }
      return {
        ...lead,
        status: "new",
        unqualifiedLeadReason: ""
      };
    }

    // For handling client specific edge cases of ULRs in their lead sheets
    if(hasUnqualifiedReason && lead.unqualifiedLeadReason === "in_progress"){
        lead.status = "in_progress";
        lead.unqualifiedLeadReason="";
    }
    else if(hasUnqualifiedReason && lead.unqualifiedLeadReason === "estimate_set"){
      lead.status = "estimate_set";
      lead.unqualifiedLeadReason="";
    }
    else if(hasUnqualifiedReason && lead.unqualifiedLeadReason === "new"){
      lead.status = "new";
      lead.unqualifiedLeadReason="";
    }

    return lead;
  });
};

export interface SkipReasons {
  missingName: number;
  missingService: number;
  missingZip: number;
  invalidRowStructure: number;
  processingErrors: number;
  total: number;
}

export interface SheetProcessingStats {
  totalRowsInSheet: number;
  validLeadsProcessed: number;
  skippedRows: number;
  skipReasons: string[];
  processedSubSheet: string;
  availableSubSheets: string[];
}

export interface SheetProcessingResult extends SheetProcessingStats {
  leadsStoredInDB: number;
  duplicatesUpdated: number;
  newLeadsAdded: number;
  conversionRatesGenerated: number;
  conversionRateInsights: {
    uniqueServices: string[];
    uniqueAdSets: string[];
    uniqueAdNames: string[];
    uniqueMonths: string[];
  };
}

export class SheetsService {
  constructor() {
    // No dependencies needed - methods will be passed as parameters
  }
  
  /**
   * Fetch and parse leads from Google Sheets
   * Supports multiple sub-sheets and handles various data formats
   */
  public async fetchLeadsFromSheet(
    sheetUrl: string,
    clientId: string
  ): Promise<{
    leads: ILead[];
    stats: SheetProcessingStats;
  }> {
    if (!validateSheetUrl(sheetUrl)) throw new Error("Invalid Google Sheet URL");
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) throw new Error("Failed to extract sheet ID from URL");
    
    // Extract GID (sub-sheet ID) from URL if present
    let targetGid: string | null = extractGid(sheetUrl);
    
    console.log(`Processing sheet ${sheetId}${targetGid ? ` (gid ${targetGid})` : ''}`);
    
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
      
      console.log(`Found ${availableSubSheets.length} sub-sheets`);
      
      // Determine which sheet to process
      if (targetGid) {
        // Find sheet by GID - when exporting with specific GID, it usually becomes the first (and only) sheet
        targetSheetName = availableSubSheets[0];
        console.log(`Processing target sub-sheet by gid: ${targetSheetName}`);
      } else {
        // No specific GID - use first sheet
        targetSheetName = availableSubSheets[0];
        console.log(`Processing default sub-sheet: ${targetSheetName}`);
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

      console.log(`Parsed ${data.length} rows from sheet`);
      
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
    const availableHeaders = data.length > 0 ? Object.keys(data[0]) : allHeaders;
    const missingHeaders = validateSheetHeaders(availableHeaders);

    // If any headers are missing, throw error before any processing
    if (missingHeaders.length > 0) {
      const requiredHeaders = getRequiredSheetHeaders();
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
      missingZip: 0,
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
        continue;
      }
      
      // OPTIMIZATION: Lead validation with early exit for performance
      const nameValue = row["Name"];
      const serviceValue = row["Service"];
      const adSetNameValue = row["Ad Set Name"];
      const adNameValue = row["Ad Name"];
      const zipValue = row["Zip"];
      
      const hasName = nameValue && String(nameValue).trim();
      const hasService = serviceValue && String(serviceValue).trim();
      const hasZip = zipValue && String(zipValue).trim();
      
      // Track specific missing fields
      let shouldSkip = false;
      const leadName = hasName ? String(row["Name"]).trim() : "Unknown";
      
      if (!hasName) {
        skipReasons.missingName++;
        skipReasons.total++;
        shouldSkip = true;
      }
      
      if (!hasService) {
        skipReasons.missingService++;
        if (!shouldSkip) skipReasons.total++;
        shouldSkip = true;
      }
      
      // Ad names can be empty - no validation needed
      
      if (!hasZip) {
        skipReasons.missingZip++;
        if (!shouldSkip) skipReasons.total++;
        shouldSkip = true;
      }
      
      if (shouldSkip) {
        continue;
      }
      
      try {
        // Parse estimate set value using utility function
        const estimateSetValue = row["Estimate Set (Yes/No)"];
        const isEstimateSet = parseEstimateSetValue(estimateSetValue);

        const status: LeadStatus = isEstimateSet ? 'estimate_set' : 'unqualified';
        const unqualifiedLeadReason = isEstimateSet ? '' : String(row["Unqualified Lead Reason"] || "");

        // Parse date using utility helper function (assume UTC for sheets inputs)
        const leadDate = utils.parseDate(row["Lead Date"], sheetRowNumber);
        // Map row to lead structure using helper, then override fields we computed
        const rawLeadData = {
          ...mapSheetRowToLead(row, clientId),
          status,
          unqualifiedLeadReason,
          leadDate
        };
        
        // Apply sanitization at entry point - this handles all string trimming
        const sanitizedLead = sanitizeLeadData(rawLeadData);
        validLeads.push(sanitizedLead as ILead);
      } catch (error) {
        skipReasons.processingErrors++;
        skipReasons.total++;
        const leadName = row["Name"] ? String(row["Name"]).trim() : "Unknown";
        console.error(`❌ Error processing Sheet Row ${sheetRowNumber} (Lead: "${leadName}"):`, error);
      }
    }

    // Log detailed skip summary
    // main summary log
    console.log(`Processed ${validLeads.length} valid leads, skipped ${skipReasons.total}`);

    // Convert skipReasons to breakdown array
    const skipReasonsBreakdown: string[] = [
      ...(skipReasons.missingName > 0 ? [`${skipReasons.missingName} rows missing Name`] : []),
      ...(skipReasons.missingService > 0 ? [`${skipReasons.missingService} rows missing Service`] : []),
      ...(skipReasons.missingZip > 0 ? [`${skipReasons.missingZip} rows missing Zip`] : []),
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

  /**
   * Extract conversion rate insights from leads data
   * Single-pass optimization for better performance
   */
  public extractConversionRateInsights(leads: ILead[]): {
    uniqueServices: string[];
    uniqueAdSets: string[];
    uniqueAdNames: string[];
    uniqueMonths: string[];
  } {
    const serviceSet = new Set<string>();
    const adSetSet = new Set<string>();
    const adNameSet = new Set<string>();
    const monthSet = new Set<string>();
    
    // Single pass through leads to collect unique values
    for (const lead of leads) {
      if (lead.service) serviceSet.add(lead.service);
      if (lead.adSetName) adSetSet.add(lead.adSetName);
      if (lead.adName) adNameSet.add(lead.adName);
      if (lead.leadDate) {
        const monthName = getMonthlyName(lead.leadDate);
        if (monthName) monthSet.add(monthName);
      }
    }
    
    return {
      uniqueServices: Array.from(serviceSet),
      uniqueAdSets: Array.from(adSetSet),
      uniqueAdNames: Array.from(adNameSet),
      uniqueMonths: Array.from(monthSet)
    };
  }

  // Static utility methods moved to leads.util.ts for better reusability

  /**
   * Process complete sheet workflow:
   * 1. Fetch and parse leads from sheet
   * 2. Extract conversion rate insights
   * 3. Return comprehensive results
   * 
   * Note: Database operations (bulk insert, conversion rate processing) 
   * are handled by the calling service to maintain separation of concerns
   */
  public async processSheetData(sheetUrl: string, clientId: string): Promise<{
    leads: ILead[];
    stats: SheetProcessingStats;
    conversionRateInsights: {
      uniqueServices: string[];
      uniqueAdSets: string[];
      uniqueAdNames: string[];
      uniqueMonths: string[];
    };
  }> {
    // 1. Fetch and parse leads from sheet
    const sheetResult = await this.fetchLeadsFromSheet(sheetUrl, clientId);
    const { leads, stats } = sheetResult;
    
    // 2. Extract conversion rate insights directly from leads
    const conversionRateInsights = this.extractConversionRateInsights(leads);
    
    return {
      leads,
      stats,
      conversionRateInsights
    };
  }

  /**
   * Process complete sheet workflow:
   * 1. Process sheet data (fetch, parse, extract insights)
   * 2. Fetch all existing leads for the client and create lookup map
   * 3. Normalize leads for sheet processing (status, unqualified reasons, preserve existing data)
   * 4. Bulk upsert leads to database with optional uniqueness
   * 5. Fetch ALL leads for this client from database (including updated ones)
   * 6. Recalculate conversion rates using ALL leads (existing + updated)
   * 7. Return comprehensive results
   */
  public async processCompleteSheet(
    sheetUrl: string,
    clientId: string,
    uniquenessByPhoneEmail: boolean = false,
    bulkCreateLeads: (leads: ILead[], uniquenessByPhoneEmail: boolean) => Promise<any>,
    computeConversionRatesForClient: (leads: ILead[], clientId: string) => any[],
    getAllLeadsForClient: (clientId: string) => Promise<ILead[]>
  ): Promise<{
    result: SheetProcessingResult;
    conversionData: any[];
  }> {
    // 1. Process sheet data (fetch, parse, extract insights)
    const sheetData = await this.processSheetData(sheetUrl, clientId);
    let { leads, stats: sheetStats, conversionRateInsights } = sheetData;

    // 2. Fetch all existing leads for the client and create lookup map
    const existingLeads = await getAllLeadsForClient(clientId);
    const leadLookup = new Map();
    existingLeads.forEach(lead => {
      const key = generateLeadLookupKey(lead);
      leadLookup.set(key, lead);
    });

    // 3. Normalise leads from sheet (status, unqualified reasons, preserve existing data)
    leads = normalizeLeadsFromSheet(leads, leadLookup);
    
    // 4. Bulk upsert leads to database with optional uniqueness
    const bulkResult = await bulkCreateLeads(leads, uniquenessByPhoneEmail);
    
    // 5. Fetch ALL leads for this client from database (including updated ones)
    const allClientLeads = await getAllLeadsForClient(clientId);
    
    // 6. Recalculate conversion rates using ALL leads (existing + updated)
    const conversionData = computeConversionRatesForClient(allClientLeads, clientId);
    
    // 7. Build comprehensive result
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
}
