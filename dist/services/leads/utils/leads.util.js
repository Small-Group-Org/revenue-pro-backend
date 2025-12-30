/**
 * Lead Service Utility Functions
 * Extracted utility functions for better modularity and reusability
 */
// Field weights for lead scoring calculation
export const FIELD_WEIGHTS = {
    service: 30,
    adSetName: 10,
    adName: 10,
    leadDate: 0,
    zip: 50
};
// Static month map for better performance
export const MONTH_MAP = {
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
// Cache for month name lookups to avoid repeated date parsing
class MonthNameCache {
    constructor() {
        this.cache = new Map();
        this.MAX_CACHE_SIZE = 1000;
    }
    get(dateStr) {
        // Check cache first for performance
        if (this.cache.has(dateStr)) {
            return this.cache.get(dateStr);
        }
        const d = new Date(dateStr);
        const result = isNaN(d.getTime()) ? null : d.toLocaleString("en-US", { month: "long" });
        // Cache the result to avoid repeated calculations
        this.cache.set(dateStr, result);
        // Clear cache if it gets too large to prevent memory leaks
        if (this.cache.size > this.MAX_CACHE_SIZE) {
            this.cache.clear();
            this.cache.set(dateStr, result);
        }
        return result;
    }
    clear() {
        this.cache.clear();
    }
}
// Singleton instance of the cache
const monthNameCache = new MonthNameCache();
/**
 * Generate a unique lookup key for a lead based on email, phone, service, and zip
 */
export const generateLeadLookupKey = (lead) => {
    return `${lead.email || ''}_${lead.phone || ''}_${lead.service || ''}_${lead.zip || ''}`;
};
/**
 * Get monthly name from date string with caching for performance
 */
export function getMonthlyName(dateStr) {
    return monthNameCache.get(dateStr);
}
/**
 * Clear the month name cache (useful for testing or memory management)
 */
export function clearMonthNameCache() {
    monthNameCache.clear();
}
/**
 * Convert conversion rates array to Map for faster O(1) lookups
 */
export function createConversionRatesMap(conversionRates) {
    const map = new Map();
    for (const rate of conversionRates) {
        const key = `${rate.keyField}:${rate.keyName}`;
        map.set(key, rate.conversionRate);
    }
    return map;
}
/**
 * Get conversion rate for specific field and value using Map for O(1) lookup
 * Assumes data is already sanitized at entry points
 */
export function getConversionRateFromMap(conversionRatesMap, field, value) {
    if (!value || value === '')
        return 0;
    const key = `${field}:${value}`;
    return conversionRatesMap.get(key) || 0;
}
/**
 * Get date-based conversion rate (monthly) using Map
 */
export function getDateConversionRateFromMap(conversionRatesMap, leadDate) {
    const monthName = getMonthlyName(leadDate);
    if (!monthName)
        return 0;
    return getConversionRateFromMap(conversionRatesMap, 'leadDate', monthName);
}
// Removed deprecated getConversionRate function - use getConversionRateFromMap for better performance
/**
 * Calculate lead score using conversion rates map and field weights
 */
export function calculateLeadScore(lead, conversionRatesMap) {
    if (!conversionRatesMap || conversionRatesMap.size === 0) {
        return 0;
    }
    // Use map lookups for O(1) access instead of array.find() which is O(n)
    const serviceRate = getConversionRateFromMap(conversionRatesMap, 'service', lead.service);
    const adSetRate = getConversionRateFromMap(conversionRatesMap, 'adSetName', lead.adSetName);
    const adNameRate = getConversionRateFromMap(conversionRatesMap, 'adName', lead.adName);
    const dateRate = getDateConversionRateFromMap(conversionRatesMap, lead.leadDate);
    const zipRate = getConversionRateFromMap(conversionRatesMap, 'zip', lead.zip || '');
    const weightedScore = (serviceRate * FIELD_WEIGHTS.service) +
        (adSetRate * FIELD_WEIGHTS.adSetName) +
        (adNameRate * FIELD_WEIGHTS.adName) +
        (dateRate * FIELD_WEIGHTS.leadDate) +
        (zipRate * FIELD_WEIGHTS.zip);
    // Simplified calculation - weightedScore is already 0-100 range
    return Math.round(Math.max(0, Math.min(100, weightedScore)));
}
export function isValidMonthName(monthName) {
    return monthName.toLowerCase() in MONTH_MAP;
}
export function getMonthIndex(monthName) {
    return MONTH_MAP[monthName.toLowerCase()];
}
// ---------------- DATA SANITIZATION UTILITIES ----------------
/**
 * Safely convert any value to a trimmed string
 * Handles null, undefined, numbers, objects, etc.
 */
export function safeStringTrim(value) {
    if (value === null || value === undefined)
        return '';
    const stringValue = typeof value === 'string' ? value : String(value);
    return stringValue.trim();
}
/**
 * Sanitize lead data at entry point to ensure consistent string formatting
 * This should be called when data first enters the system (sheet processing, API creation)
 */
export function sanitizeLeadData(leadData) {
    return {
        ...leadData,
        name: safeStringTrim(leadData.name),
        email: safeStringTrim(leadData.email),
        phone: safeStringTrim(leadData.phone),
        zip: safeStringTrim(leadData.zip),
        service: safeStringTrim(leadData.service),
        adSetName: safeStringTrim(leadData.adSetName),
        adName: safeStringTrim(leadData.adName),
        unqualifiedLeadReason: safeStringTrim(leadData.unqualifiedLeadReason),
        // Keep other fields as-is (leadDate, status, clientId, etc.)
        leadDate: leadData.leadDate,
        status: leadData.status,
        clientId: leadData.clientId,
        leadScore: leadData.leadScore,
        conversionRates: leadData.conversionRates
    };
}
/**
 * Check if a sanitized string value is empty or whitespace-only
 */
export function isEmptyValue(value) {
    return !value || value.length === 0;
}
