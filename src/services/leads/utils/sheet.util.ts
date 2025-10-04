import { SHEET, VALIDATION } from "./config.js";

/**
 * Sheet Processing Utility Functions
 * Functions specifically for Google Sheets processing and validation
 */

/**
 * Validate Google Sheets URL format
 */
export function validateSheetUrl(sheetUrl: string): boolean {
  const match = sheetUrl.match(VALIDATION.SHEET_URL_REGEX);
  return !!match;
}

/**
 * Extract sheet ID from Google Sheets URL
 */
export function extractSheetId(sheetUrl: string): string | null {
  const match = sheetUrl.match(VALIDATION.SHEET_URL_REGEX);
  return match ? match[1] : null;
}

/**
 * Extract GID (sub-sheet ID) from Google Sheets URL
 */
export function extractGid(sheetUrl: string): string | null {
  const gidMatch = sheetUrl.match(VALIDATION.GID_REGEX);
  return gidMatch ? gidMatch[1] : null;
}

/**
 * Parse estimate set value from various formats
 */
export function parseEstimateSetValue(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    return SHEET.ESTIMATE_SET_TRUE_VALUES.includes(normalized as any);
  }

  return false;
}

/**
 * Validate required sheet headers
 */
export function validateSheetHeaders(availableHeaders: string[]): string[] {
  const missingHeaders: string[] = [];
  
  for (const requiredHeader of SHEET.REQUIRED_HEADERS) {
    if (!availableHeaders.includes(requiredHeader)) {
      missingHeaders.push(requiredHeader);
    }
  }

  return missingHeaders;
}

/**
 * Get required headers for lead sheets
 */
export function getRequiredSheetHeaders(): readonly string[] {
  return SHEET.REQUIRED_HEADERS;
}

/**
 * Map sheet row data to lead object structure
 */
export function mapSheetRowToLead(
  rowData: Record<string, any>,
  clientId: string,
  defaultStatus: string = 'new'
): any {
  const estimateSet = parseEstimateSetValue(rowData["Estimate Set (Yes/No)"]);
  
  return {
    clientId,
    leadDate: rowData["Lead Date"] || new Date().toISOString().split('T')[0],
    name: safeStringTrim(rowData["Name"]),
    email: safeStringTrim(rowData["Email"]),
    phone: safeStringTrim(rowData["Phone"]),
    zip: safeStringTrim(rowData["Zip"]),
    service: safeStringTrim(rowData["Service"]),
    adSetName: safeStringTrim(rowData["Ad Set Name"]),
    adName: safeStringTrim(rowData["Ad Name"]),
    status: estimateSet ? 'estimate_set' : 
            rowData["Unqualified Lead Reason"] ? 'unqualified' : defaultStatus,
    unqualifiedLeadReason: safeStringTrim(rowData["Unqualified Lead Reason"]) || undefined,
    isDeleted: false
  };
}

// Helper function for string trimming (imported from leads.util.ts)
function safeStringTrim(value: any): string {
  if (value === null || value === undefined) return '';
  
  const stringValue = typeof value === 'string' ? value : String(value);
  return stringValue.trim();
}
