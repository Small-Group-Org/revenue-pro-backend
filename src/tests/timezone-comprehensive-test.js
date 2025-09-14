import { TimezoneUtils } from '../../dist/utils/timezoneUtils.js';
import { DateTime } from 'luxon';

/**
 * Comprehensive Timezone Utility Test Suite
 * Combines all timezone testing functionality into one unified test file
 */

const LEAD_TIMEZONE = 'America/Chicago';

console.log('🧪 COMPREHENSIVE TIMEZONE CONVERSION TEST SUITE\n');
console.log('=' .repeat(60));

// ============================================================================
// SECTION 1: BASIC FUNCTIONALITY TEST
// ============================================================================
console.log('\n📋 SECTION 1: Basic Functionality Test');
console.log('-'.repeat(40));

const basicTestDate = '2025-09-10 19:03:25';
console.log(`Testing basic conversion: "${basicTestDate}"`);

const basicResult = TimezoneUtils.convertLeadDateToUTCString(basicTestDate, 1);

if (basicResult.success) {
  console.log('✅ SUCCESS!');
  console.log(`   UTC ISO String: ${basicResult.utcIsoString}`);
  console.log(`   Original value: ${basicResult.originalValue}`);
} else {
  console.log('❌ FAILED!');
  console.log(`   Error: ${basicResult.error}`);
  console.log(`   Original value: ${basicResult.originalValue}`);
}

// ============================================================================
// SECTION 2: COMPREHENSIVE TEST CASES
// ============================================================================
console.log('\n📋 SECTION 2: Comprehensive Test Cases');
console.log('-'.repeat(40));

const comprehensiveTestCases = [
  // Space-separated formats (the main issue)
  { input: '2025-09-10 19:03:25', expected: '2025-09-11T00:03:25.000Z', description: 'Space-separated with double digits' },
  { input: '2025-09-07 0:52:15', expected: '2025-09-07T05:52:15.000Z', description: 'Space-separated with single digit hour' },
  { input: '2025-09-09 6:04:09', expected: '2025-09-09T11:04:09.000Z', description: 'Space-separated with single digit hour' },
  
  // ISO formats
  { input: '2025-09-10', expected: '2025-09-10T05:00:00.000Z', description: 'Date only (midnight CST)' },
  { input: '2025-09-10T19:03:25', expected: '2025-09-11T00:03:25.000Z', description: 'ISO format with T separator' },
  
  // Edge cases
  { input: '2025-12-31 23:59:59', expected: '2026-01-01T05:59:59.000Z', description: 'New Year transition' },
  { input: '2025-01-01 00:00:00', expected: '2025-01-01T06:00:00.000Z', description: 'New Year start' },
  
  // Milliseconds formats
  { input: '2025-09-10 19:03:25.123', expected: '2025-09-11T00:03:25.123Z', description: 'Space-separated with full milliseconds' },
  { input: '2025-09-10 19:03:25.12', expected: '2025-09-11T00:03:25.120Z', description: 'Space-separated with partial milliseconds' },
  { input: '2025-09-10 19:03:25.1', expected: '2025-09-11T00:03:25.100Z', description: 'Space-separated with single digit milliseconds' },
];

let comprehensivePassed = 0;
let comprehensiveFailed = 0;

comprehensiveTestCases.forEach((testCase, index) => {
  const result = TimezoneUtils.convertLeadDateToUTCString(testCase.input, index + 1);
  
  if (result.success && result.utcIsoString === testCase.expected) {
    comprehensivePassed++;
    console.log(`✅ Test ${index + 1}: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}" → Output: "${result.utcIsoString}"`);
  } else {
    comprehensiveFailed++;
    console.log(`❌ Test ${index + 1}: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}"`);
    if (result.success) {
      console.log(`   Expected: "${testCase.expected}"`);
      console.log(`   Got: "${result.utcIsoString}"`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
  }
  console.log('');
});

console.log(`📊 Comprehensive Results: ${comprehensivePassed} passed, ${comprehensiveFailed} failed`);

// ============================================================================
// SECTION 3: REAL-WORLD PROBLEMATIC DATES
// ============================================================================
console.log('\n📋 SECTION 3: Real-World Problematic Dates from Logs');
console.log('-'.repeat(40));

const problematicDates = [
  '2025-09-07 0:52:15',
  '2025-09-07 1:27:28', 
  '2025-09-07 14:23:35',
  '2025-09-09 1:56:06',
  '2025-09-09 6:04:09',
  '2025-09-09 6:20:16',
  '2025-09-09 20:54:46',
  '2025-09-10 0:25:16',
  '2025-09-10 5:41:25',
  '2025-09-10 14:50:23',
  '2025-09-10 19:03:25',
  '2025-09-13 14:46:29',
  '2025-09-13 15:25:06',
  '2025-09-13 16:00:58',
  '2025-09-13 20:07:42'
];

let problematicSuccess = 0;
let problematicFailed = 0;

console.log('Testing all problematic dates from the logs...\n');

problematicDates.forEach((dateString, index) => {
  const result = TimezoneUtils.convertLeadDateToUTCString(dateString, index + 1);
  
  if (result.success) {
    problematicSuccess++;
    console.log(`✅ ${dateString} → ${result.utcIsoString}`);
  } else {
    problematicFailed++;
    console.log(`❌ ${dateString} → ERROR: ${result.error}`);
  }
});

console.log(`\n📊 Problematic Dates Results: ${problematicSuccess} success, ${problematicFailed} failed`);

// ============================================================================
// SECTION 4: REGEX PATTERN TESTING
// ============================================================================
console.log('\n📋 SECTION 4: Regex Pattern Testing');
console.log('-'.repeat(40));

const testDate = '2025-09-10T19:03:25';
console.log(`Testing regex patterns for: "${testDate}"`);

const patterns = [
  { name: 'Date only', regex: /^\d{4}-\d{1,2}-\d{1,2}$/ },
  { name: 'Space-separated', regex: /^\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}$/ },
  { name: 'ISO with timezone', regex: /^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?([Z]|[+-]\d{2}:?\d{2})$/ },
  { name: 'ISO without timezone', regex: /^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?$/ },
  { name: 'US/European format', regex: /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/ }
];

patterns.forEach(pattern => {
  const matches = pattern.regex.test(testDate);
  console.log(`${pattern.name}: ${matches ? '✅ MATCH' : '❌ NO MATCH'}`);
});

console.log('\nThe ISO without timezone pattern should match and handle this case.');

// ============================================================================
// SECTION 5: LUXON PARSING METHODS COMPARISON
// ============================================================================
console.log('\n📋 SECTION 5: Luxon Parsing Methods Comparison');
console.log('-'.repeat(40));

const debugDate = '2025-09-10T19:03:25';
console.log(`Debugging ISO format parsing for: "${debugDate}"`);
console.log(`Timezone: ${LEAD_TIMEZONE}`);

// Method 1: Parse as ISO then set zone
const method1 = DateTime.fromISO(debugDate).setZone(LEAD_TIMEZONE);
console.log('\nMethod 1 (fromISO + setZone):');
console.log(`   Valid: ${method1.isValid}`);
console.log(`   DateTime: ${method1.toString()}`);
console.log(`   UTC: ${method1.toUTC().toString()}`);
console.log(`   UTC ISO: ${method1.toUTC().toISO()}`);

// Method 2: Parse directly with zone
const method2 = DateTime.fromISO(debugDate, { zone: LEAD_TIMEZONE });
console.log('\nMethod 2 (fromISO with zone):');
console.log(`   Valid: ${method2.isValid}`);
console.log(`   DateTime: ${method2.toString()}`);
console.log(`   UTC: ${method2.toUTC().toString()}`);
console.log(`   UTC ISO: ${method2.toUTC().toISO()}`);

// Method 3: Parse as local then convert
const method3 = DateTime.fromISO(debugDate).setZone(LEAD_TIMEZONE);
console.log('\nMethod 3 (fromISO + setZone):');
console.log(`   Valid: ${method3.isValid}`);
console.log(`   DateTime: ${method3.toString()}`);
console.log(`   UTC: ${method3.toUTC().toString()}`);
console.log(`   UTC ISO: ${method3.toUTC().toISO()}`);

console.log('\nExpected: 2025-09-11T00:03:25.000Z (CST 19:03:25 = UTC 00:03:25 next day)');

// ============================================================================
// SECTION 6: FINAL SUMMARY
// ============================================================================
console.log('\n📋 SECTION 6: Final Summary');
console.log('-'.repeat(40));

const totalTests = comprehensiveTestCases.length + problematicDates.length;
const totalPassed = comprehensivePassed + problematicSuccess;
const totalFailed = comprehensiveFailed + problematicFailed;

console.log(`📊 OVERALL TEST RESULTS:`);
console.log(`   Total Tests: ${totalTests}`);
console.log(`   Passed: ${totalPassed}`);
console.log(`   Failed: ${totalFailed}`);
console.log(`   Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

if (totalFailed === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Timezone conversion is working perfectly.');
} else {
  console.log(`\n⚠️  ${totalFailed} tests failed. Please review the errors above.`);
}

console.log('\n' + '=' .repeat(60));
console.log('🏁 Test suite completed.');
