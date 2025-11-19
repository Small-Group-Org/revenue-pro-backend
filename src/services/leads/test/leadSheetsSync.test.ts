import { connectDB } from '../../../pkg/mongodb/connection.js';
import { config } from '../../../config.js';
import leadSheetsSyncService from '../service/leadSheetsSync.service.js';
import { leadRepository } from '../repository/LeadRepository.js';
import http from '../../../pkg/http/client.js';

/**
 * Lead Sheets Sync Test Script
 * 
 * This test script validates the lead sheets sync logic without actually updating the database.
 * 
 * What it does:
 * 1. Connects to database
 * 2. Fetches first 2 active GHL clients (or uses config if available)
 * 3. Retrieves opportunities from GHL for each client
 * 4. Extracts emails and tags from opportunities
 * 5. Checks if emails exist in database
 * 6. Shows current status vs. what status would be updated to
 * 7. Generates a detailed report
 * 
 * Usage:
 *   npx ts-node src/services/leads/test/leadSheetsSync.test.ts
 * 
 * Note: This script does NOT modify the database - it only shows what would happen.
 */

interface TestOpportunity {
  id: string;
  contactId?: string;
  contact?: {
    email?: string;
    name?: string;
    tags?: string[];
  };
  relations?: Array<{
    tags?: string[];
  }>;
  pipelineId?: string;
}

interface TestGhlResponse {
  opportunities: TestOpportunity[];
  meta: {
    total: number;
    nextPageUrl?: string | null;
  };
}

interface EmailAnalysis {
  email: string;
  name: string;
  tags: string[];
  inDb: boolean;
  currentStatus?: string;
  wouldUpdateTo?: string;
  unqualifiedReason?: string;
  leadId?: string;
  service?: string;
  zip?: string;
  hasFacebookLeadTag: boolean;
  wouldSkip: boolean;
  skipReason?: string;
}

interface ClientTestResult {
  locationId: string;
  pipelineId: string;
  revenueProClientId: string;
  totalEmails: number;
  emailsInDb: number;
  emailsNotInDb: number;
  wouldBeUpdated: number;
  wouldBeSkipped: number;
  emailDetails: EmailAnalysis[];
  statusChanges: Array<{ email: string; from: string; to: string }>;
}

/**
 * Collect all tags from an opportunity
 */
function collectTags(opportunity: TestOpportunity): string[] {
  const tags: string[] = [];
  
  if (Array.isArray(opportunity.contact?.tags)) {
    tags.push(...opportunity.contact.tags);
  }

  if (Array.isArray(opportunity.relations)) {
    for (const rel of opportunity.relations) {
      if (Array.isArray(rel.tags)) {
        tags.push(...rel.tags);
      }
    }
  }

  return tags;
}

/**
 * Determine status from tags (same logic as service)
 */
function determineStatusFromTags(tags: string[]): { status: string; unqualifiedReason?: string } | null {
  const NEW_LEAD_TAGS = [ 'facebook lead'];
  const IN_PROGRESS_TAGS = [
    'day1am', 'day1pm', 'day2am', 'day2pm', 'day3am', 'day3pm',
    'day4am', 'day4pm', 'day5am', 'day5pm', 'day6am', 'day6pm',
    'day7am', 'day7pm', 'day8am', 'day8pm', 'day9am', 'day9pm',
    'day10am', 'day10pm', 'day11am', 'day11pm', 'day12am', 'day12pm',
    'day13am', 'day13pm', 'day14am', 'day14pm'
  ];
  const ESTIMATE_SET_TAGS = ['appt_completed', 'appt_cancelled', 'job_won', 'job_lost', 'appt_booked'];
  const UNQUALIFIED_TAGS = [
    'dq - bad phone number',
    'dq - job too small',
    'dq - looking for job',
    'dq - no longer interested',
    'dq - out of area',
    'dq - said didn\'t fill out a form',
    'dq - service not offered',
    'dq - services we dont offer'
  ];

  const ALL_ALLOWED_TAGS = [
    ...NEW_LEAD_TAGS,
    ...IN_PROGRESS_TAGS,
    ...ESTIMATE_SET_TAGS,
    ...UNQUALIFIED_TAGS
  ];

  const lowerTags = tags.map(t => String(t).toLowerCase());
  
  // Filter to only allowed tags (ignore unknown tags)
  const allowedTags = lowerTags.filter(tag => 
    ALL_ALLOWED_TAGS.some(allowed => allowed.toLowerCase() === tag)
  );
  const tagSet = new Set(allowedTags);

  // Mandatory check
  if (!tagSet.has('facebook lead')) {
    return null;
  }

  // Priority 1: Unqualified (only from allowed tags)
  const unqualifiedTag = UNQUALIFIED_TAGS.find(tag => tagSet.has(tag.toLowerCase()));
  if (unqualifiedTag) {
    return {
      status: 'unqualified',
      unqualifiedReason: unqualifiedTag
    };
  }

  // Priority 2: Estimate set
  const estimateSetTag = ESTIMATE_SET_TAGS.find(tag => tagSet.has(tag.toLowerCase()));
  if (estimateSetTag) {
    return { status: 'estimate_set' };
  }

  // Priority 3: In progress
  const inProgressTag = IN_PROGRESS_TAGS.find(tag => tagSet.has(tag.toLowerCase()));
  if (inProgressTag) {
    return { status: 'in_progress' };
  }

  // Default: Only has "facebook lead" (unknown tags are ignored)
  return { status: 'new' };
}

/**
 * Fetch opportunities from GHL
 */
async function fetchOpportunities(
  locationId: string,
  pipelineId: string,
  apiToken: string
): Promise<TestOpportunity[]> {
  const client = new http(config.GHL_BASE_URL, 15000);
  const allOpportunities: TestOpportunity[] = [];
  let url: string | null = `/opportunities/search?location_id=${encodeURIComponent(locationId)}`;

  while (url) {
    try {
      const response = await client.get<TestGhlResponse>(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Version: '2021-07-28',
        },
      }) as TestGhlResponse;

      if (response?.opportunities?.length) {
        const filtered: TestOpportunity[] = pipelineId
          ? response.opportunities.filter((opp: TestOpportunity) => opp.pipelineId === pipelineId)
          : response.opportunities;
        
        allOpportunities.push(...filtered);
      }

      url = response?.meta?.nextPageUrl || null;
    } catch (error: any) {
      console.error('Failed to fetch opportunities:', error.message || String(error));
      throw error;
    }
  }

  return allOpportunities;
}

/**
 * Test sync for a single client
 */
async function testClientSync(
  locationId: string,
  pipelineId: string,
  revenueProClientId: string,
  apiToken: string
): Promise<ClientTestResult> {
  console.log(`\nFetching opportunities for client ${revenueProClientId}...`);
  const opportunities = await fetchOpportunities(locationId, pipelineId, apiToken);
  
  console.log(`Found ${opportunities.length} opportunities`);

  // Extract unique emails with their data
  // Only include emails that have "facebook lead" tag (matching service behavior)
  const emailMap = new Map<string, EmailAnalysis>();

  for (const opp of opportunities) {
    const email = opp.contact?.email?.trim();
    if (!email) continue;

    const tags = collectTags(opp);
    const hasFacebookLeadTag = tags.some(t => String(t).toLowerCase() === 'facebook lead');
    
    // Only process emails with "facebook lead" tag (matching service logic)
    if (!hasFacebookLeadTag) continue;
    
    if (!emailMap.has(email)) {
      emailMap.set(email, {
        email,
        name: opp.contact?.name || 'Unknown',
        tags: [...new Set(tags)], // Remove duplicates
        inDb: false,
        hasFacebookLeadTag: true, // Always true since we filtered above
        wouldSkip: false
      });
    } else {
      // Merge tags if email already seen
      const existing = emailMap.get(email)!;
      const allTags = [...new Set([...existing.tags, ...tags])];
      existing.tags = allTags;
      existing.hasFacebookLeadTag = true; // Always true since we filtered above
    }
  }

  // Check which emails exist in database
  console.log(`Checking database for ${emailMap.size} unique emails...`);
  
  for (const [email, analysis] of emailMap.entries()) {
    const leads = await leadRepository.findLeads({
      email,
      clientId: revenueProClientId
    });

    if (leads && leads.length > 0) {
      analysis.inDb = true;
      const lead = leads[0]; // Use first match
      analysis.currentStatus = lead.status;
      analysis.leadId = (lead as any)._id?.toString() || (lead as any).id;
      analysis.service = lead.service;
      analysis.zip = lead.zip;

      // Determine what status would be updated to
      // Note: hasFacebookLeadTag is always true since we filtered above
      const statusResult = determineStatusFromTags(analysis.tags);
      if (statusResult) {
        analysis.wouldUpdateTo = statusResult.status;
        analysis.unqualifiedReason = statusResult.unqualifiedReason;

        // Check if update is needed
        if (lead.status === statusResult.status && 
            (lead.unqualifiedLeadReason || '') === (statusResult.unqualifiedReason || '')) {
          analysis.wouldSkip = true;
          analysis.skipReason = 'No status change needed';
        } else if (!lead.service || !lead.zip) {
          analysis.wouldSkip = true;
          analysis.skipReason = 'Missing required fields (service or zip)';
        }
      } else {
        // This shouldn't happen since we filtered for facebook lead tag, but handle it anyway
        analysis.wouldSkip = true;
        analysis.skipReason = 'Missing mandatory "facebook lead" tag';
      }
    } else {
      analysis.wouldSkip = true;
      analysis.skipReason = 'Lead not found in database';
    }
  }

  // Calculate statistics
  const emailDetails = Array.from(emailMap.values());
  const emailsInDb = emailDetails.filter(e => e.inDb).length;
  const emailsNotInDb = emailDetails.filter(e => !e.inDb).length;
  const wouldBeUpdated = emailDetails.filter(e => e.inDb && !e.wouldSkip && e.wouldUpdateTo).length;
  const wouldBeSkipped = emailDetails.filter(e => e.wouldSkip).length;

  const statusChanges = emailDetails
    .filter(e => e.inDb && !e.wouldSkip && e.currentStatus && e.wouldUpdateTo && e.currentStatus !== e.wouldUpdateTo)
    .map(e => ({
      email: e.email,
      from: e.currentStatus!,
      to: e.wouldUpdateTo!
    }));

  return {
    locationId,
    pipelineId,
    revenueProClientId,
    totalEmails: emailDetails.length,
    emailsInDb,
    emailsNotInDb,
    wouldBeUpdated,
    wouldBeSkipped,
    emailDetails,
    statusChanges
  };
}

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('================================================================================');
    console.log('LEAD SHEETS SYNC TEST');
    console.log('================================================================================');
    console.log('This test shows what would happen without modifying the database.\n');

    // Connect to database
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected.\n');

    // Use the same client ID as opportunity sync
    const locationId = config.GHL_LOCATION_ID;
    const TARGET_PIPELINE_ID = 'FWfjcNV1hNqg3YBfHDHi';
    const userId = '68c82dfdac1491efe19d5df0'; // Same userId as opportunity sync
    const apiToken = config.GHL_API_TOKEN;

    if (!locationId || !apiToken) {
      console.error('GHL_LOCATION_ID and GHL_API_TOKEN must be configured.');
      process.exit(1);
    }

    console.log(`Testing with client ID: ${userId}\n`);

    const results: ClientTestResult[] = [];

    // Test the client
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Client: ${userId}`);
    console.log('='.repeat(80));
    
    const result = await testClientSync(
      locationId,
      TARGET_PIPELINE_ID,
      userId,
      apiToken
    );
    
    results.push(result);

    // Print summary for this client
    console.log(`\nSummary:`);
    console.log(`  Location ID: ${result.locationId}`);
    console.log(`  Pipeline ID: ${result.pipelineId}`);
    console.log(`  RevenuePro Client ID: ${result.revenueProClientId}`);
    console.log(`  Total Emails Found: ${result.totalEmails}`);
    console.log(`  Emails in DB: ${result.emailsInDb}`);
    console.log(`  Emails NOT in DB: ${result.emailsNotInDb}`);
    console.log(`  Would be updated: ${result.wouldBeUpdated}`);
    console.log(`  Would be skipped: ${result.wouldBeSkipped}`);

    // Show first 10 email details
    console.log(`\n  Email Details (first 10):`);
    console.log('  ' + '-'.repeat(78));
    const detailsToShow = result.emailDetails.slice(0, 10);
    for (const detail of detailsToShow) {
      console.log(`  Email: ${detail.email}`);
      console.log(`    Name: ${detail.name}`);
      console.log(`    Tags: ${detail.tags.join(', ') || 'None'}`);
      console.log(`    In DB: ${detail.inDb ? 'YES' : 'NO'}`);
      if (detail.inDb) {
        console.log(`    Current Status: ${detail.currentStatus || 'N/A'}`);
        console.log(`    Would Update To: ${detail.wouldUpdateTo || 'N/A'}`);
        if (detail.unqualifiedReason) {
          console.log(`    Unqualified Reason: ${detail.unqualifiedReason}`);
        }
        console.log(`    Lead ID: ${detail.leadId || 'N/A'}`);
        console.log(`    Service: ${detail.service || 'N/A'}`);
        console.log(`    Zip: ${detail.zip || 'N/A'}`);
        if (detail.wouldSkip) {
          console.log(`    ⚠️  Would Skip: ${detail.skipReason}`);
        }
      } else {
        console.log(`    ⚠️  Would Skip: ${detail.skipReason}`);
      }
      console.log('');
    }

    if (result.emailDetails.length > 10) {
      console.log(`  ... and ${result.emailDetails.length - 10} more emails`);
    }

    // Show status changes
    if (result.statusChanges.length > 0) {
      console.log(`\n  Status Changes:`);
      for (const change of result.statusChanges) {
        console.log(`    ${change.email}: ${change.from} → ${change.to}`);
      }
    }

    // Overall summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Clients Tested: ${results.length}`);
    console.log(`Total Emails Found: ${result.totalEmails}`);
    console.log(`Total Emails in DB: ${result.emailsInDb}`);
    console.log(`Total Would be Updated: ${result.wouldBeUpdated}`);
    console.log(`Total Would be Skipped: ${result.wouldBeSkipped}`);

    console.log(`\n${'='.repeat(80)}`);
    console.log('TEST COMPLETED');
    console.log('='.repeat(80));
    console.log('\nNote: No database changes were made. This was a dry run.\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message || String(error));
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
runTest();

