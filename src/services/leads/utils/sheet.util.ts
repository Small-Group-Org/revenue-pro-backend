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
 * Check if header is required
 */
export function isRequiredHeader(header: string): boolean {
  return SHEET.REQUIRED_HEADERS.includes(header as any);
}

/**
 * Normalize header name (remove extra spaces, standardize case)
 */
export function normalizeHeaderName(header: string): string {
  return header.trim().replace(/\s+/g, ' ');
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

/**
 * Validate sheet row data
 */
export function validateSheetRow(rowData: Record<string, any>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!rowData["Name"] || safeStringTrim(rowData["Name"]) === '') {
    errors.push('Name is required');
  }
  
  if (!rowData["Service"] || safeStringTrim(rowData["Service"]) === '') {
    errors.push('Service is required');
  }
  
  if (!rowData["Ad Set Name"] || safeStringTrim(rowData["Ad Set Name"]) === '') {
    errors.push('Ad Set Name is required');
  }
  
  if (!rowData["Ad Name"] || safeStringTrim(rowData["Ad Name"]) === '') {
    errors.push('Ad Name is required');
  }
  
  // Check that either email or phone is provided
  const hasEmail = rowData["Email"] && safeStringTrim(rowData["Email"]) !== '';
  const hasPhone = rowData["Phone"] && safeStringTrim(rowData["Phone"]) !== '';
  
  if (!hasEmail && !hasPhone) {
    errors.push('Either email or phone is required');
  }
  
  // Validate email format if provided
  if (hasEmail && !VALIDATION.EMAIL_REGEX.test(safeStringTrim(rowData["Email"]))) {
    errors.push('Invalid email format');
  }
  
  // Validate lead date if provided
  if (rowData["Lead Date"]) {
    const date = new Date(rowData["Lead Date"]);
    if (isNaN(date.getTime())) {
      errors.push('Invalid lead date format');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get sheet processing statistics
 */
export function getProcessingStats(
  totalRows: number,
  validRows: number,
  duplicates: number,
  errors: string[]
): {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  processed: number;
  errorCount: number;
  errors: string[];
} {
  return {
    totalRows,
    validRows,
    invalidRows: totalRows - validRows,
    duplicates,
    processed: validRows - duplicates,
    errorCount: errors.length,
    errors
  };
}

/**
 * Create CSV export headers
 */
export function createCsvHeaders(): string[] {
  return [
    'Lead Date',
    'Name', 
    'Email',
    'Phone',
    'Zip',
    'Service',
    'Ad Set Name',
    'Ad Name',
    'Status',
    'Unqualified Lead Reason',
    'Lead Score'
  ];
}

/**
 * Convert lead data to CSV row
 */
export function leadToCsvRow(lead: any): string[] {
  return [
    lead.leadDate || '',
    lead.name || '',
    lead.email || '',
    lead.phone || '',
    lead.zip || '',
    lead.service || '',
    lead.adSetName || '',
    lead.adName || '',
    lead.status || '',
    lead.unqualifiedLeadReason || '',
    lead.leadScore?.toString() || '0'
  ];
}

// Helper function for string trimming (imported from leads.util.ts)
function safeStringTrim(value: any): string {
  if (value === null || value === undefined) return '';
  
  const stringValue = typeof value === 'string' ? value : String(value);
  return stringValue.trim();
}
