import fetch from "node-fetch";
import * as XLSX from "xlsx";
import { ILead, LeadStatus } from "../domain/leads.domain.js";
import { 
  getMonthlyName, 
  parseEstimateSetValue,
  validateSheetHeaders,
  getRequiredSheetHeaders,
  sanitizeLeadData
} from "../utils/leads.util.js";
import utils from "../../../utils/utils.js";

/**
 * Google Sheets Service
 * Handles all Google Sheets related operations for lead processing
 */

export interface SkipReasons {
  missingName: number;
  missingService: number;
  missingAdSetName: number;
  missingAdName: number;
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
      
      // OPTIMIZATION: Lead validation with early exit for performance
      const nameValue = row["Name"];
      const serviceValue = row["Service"];
      const adSetNameValue = row["Ad Set Name"];
      const adNameValue = row["Ad Name"];
      
      const hasName = nameValue && String(nameValue).trim();
      const hasService = serviceValue && String(serviceValue).trim();
      const hasAdSetName = adSetNameValue && String(adSetNameValue).trim();
      const hasAdName = adNameValue && String(adNameValue).trim();
      
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
        // Parse estimate set value using utility function
        const estimateSetValue = row["Estimate Set (Yes/No)"];
        const isEstimateSet = parseEstimateSetValue(estimateSetValue);

        const status: LeadStatus = isEstimateSet ? 'estimate_set' : 'unqualified';
        const unqualifiedLeadReason = isEstimateSet ? '' : String(row["Unqualified Lead Reason"] || "");

        // Parse date using utility helper function
        const leadDate = utils.parseDate(row["Lead Date"], sheetRowNumber);
        console.log(`Processing Sheet Row ${sheetRowNumber}, email:`, row["Email"]);
        
        // Create raw lead data and sanitize it at entry point
        const rawLeadData = {
          status,
          leadDate,
          name: row["Name"] || "",
          email: row["Email"] || "",
          phone: row["Phone"] || "",
          zip: row["Zip"] || "",
          service: row["Service"] || "",
          adSetName: row["Ad Set Name"] || "",
          adName: row["Ad Name"] || "",
          unqualifiedLeadReason,
          clientId,
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
}
