# MongoDB Cron Job Logging System

This document describes the new MongoDB-based cron job logging system that replaces the previous file-based logging approach.

## Overview

The new system logs all cron job executions directly to MongoDB in the `leads_cron_logs` collection, providing better persistence, queryability, and integration with the existing database infrastructure.

## Features

### ✅ **MongoDB Storage**
- All cron job logs are stored in the `leads_cron_logs` collection
- Persistent storage that survives server restarts
- Integrated with existing MongoDB connection

### ✅ **Comprehensive Logging**
- **Job Start**: Logs when a cron job begins execution
- **Job Success**: Logs successful completion with detailed metrics
- **Job Failure**: Logs failures with error details and stack traces

### ✅ **Flexible Details Field**
- Supports both string narratives and structured object data
- Can store quantified metrics (counts, processing statistics, etc.)
- BSON Mixed type allows for maximum flexibility

### ✅ **Efficient Querying**
- Optimized indexes for common query patterns
- Fast lookups by job name, status, and date ranges
- Execution ID tracking for related log entries

### ✅ **API Endpoints**
- RESTful API for viewing logs and statistics
- Programmatic access to cron job data
- Integration with existing authentication system

## Database Schema

### Collection: `leads_cron_logs`

```typescript
interface ICronLog {
  jobName: string;           // e.g., "weeklyLeadProcessor"
  status: 'started' | 'success' | 'failure';
  startedAt: Date;           // When the job started
  finishedAt?: Date;         // When the job finished (for completed jobs)
  details: string | object;  // Narrative or structured data
  processedCount?: number;   // Number of items processed
  error?: string;           // Error message (for failures)
  executionId?: string;     // Unique ID for tracking related entries
  createdAt: Date;          // Document creation timestamp
  updatedAt: Date;          // Document last update timestamp
}
```

### Indexes

The following indexes are created for optimal query performance:

1. **Compound Index**: `{ jobName: 1, startedAt: -1 }`
   - Efficient queries for specific jobs ordered by start time

2. **Status Index**: `{ status: 1, startedAt: -1 }`
   - Fast filtering by job status

3. **Execution ID Index**: `{ executionId: 1 }`
   - Quick lookup of related log entries

4. **Individual Indexes**: `jobName`, `startedAt`, `finishedAt`
   - Support for various query patterns

## Usage

### 1. Basic Logging

```typescript
import { MongoCronLogger } from './utils/mongoCronLogger.js';

// Start a job
const logId = await MongoCronLogger.logCronJobStart({
  jobName: "weeklyLeadProcessor",
  details: "Starting weekly lead processing...",
  executionId: "2024-01-15T10-30-00-abc123"
});

// Log success
await MongoCronLogger.logCronJobSuccess({
  logId,
  details: {
    message: "Processing completed successfully",
    processedLeads: 1500,
    newLeads: 200,
    duplicatesRemoved: 50
  },
  processedCount: 1500
});

// Log failure
await MongoCronLogger.logCronJobFailure({
  logId,
  error: "Database connection timeout",
  details: {
    message: "Failed after processing 500 leads",
    error: "Database connection timeout",
    processedLeads: 500
  },
  processedCount: 500
});
```

### 2. Convenience Function

```typescript
import { logCronJob } from './utils/mongoCronLogger.js';

// Start
const logId = await logCronJob("weeklyLeadProcessor", "started", "Starting...");

// Success
await logCronJob("weeklyLeadProcessor", "success", "Completed successfully", {
  logId,
  processedCount: 1500
});

// Failure
await logCronJob("weeklyLeadProcessor", "failure", "Failed to process", {
  logId,
  error: "Connection timeout",
  processedCount: 500
});
```

## API Endpoints

### Get Cron Job Statistics
```
GET /api/v1/cron-logs/stats?jobName=weeklyLeadProcessor&days=30
```

Response:
```json
{
  "success": true,
  "data": {
    "jobName": "weeklyLeadProcessor",
    "period": "30 days",
    "totalRuns": 4,
    "successfulRuns": 3,
    "failedRuns": 1,
    "successRate": 75,
    "averageDuration": 125000,
    "lastRun": "2024-01-15T10:30:00.000Z"
  }
}
```

### Get Recent Logs
```
GET /api/v1/cron-logs/recent?jobName=weeklyLeadProcessor&limit=10
```

### Get Logs by Execution ID
```
GET /api/v1/cron-logs/execution/2024-01-15T10-30-00-abc123
```

### Cleanup Old Logs
```
POST /api/v1/cron-logs/cleanup
{
  "jobName": "weeklyLeadProcessor",
  "keepCount": 100
}
```

## Migration

### 1. Run Index Migration

```bash
# Run the migration script to create indexes
npx ts-node src/migrations/addCronLogIndexes.ts
```

### 2. Update Existing Code

The `ConversionRateUpdateService` has been updated to use the new MongoDB logging system. The old file-based logging is kept as a backup but is no longer the primary logging mechanism.

## MongoDB Compass Integration

After implementing this system, you can:

1. **Open MongoDB Compass**
2. **Navigate to the `leads_cron_logs` collection**
3. **View detailed cron job history** with:
   - Job start/finish times
   - Success/failure status
   - Detailed processing metrics
   - Error messages and stack traces
   - Execution IDs for tracking related entries

### Sample Queries in Compass

```javascript
// Get all successful runs for the last 7 days
{
  "status": "success",
  "startedAt": { "$gte": new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
}

// Get failed runs with error details
{
  "status": "failure",
  "error": { "$exists": true }
}

// Get logs for a specific execution
{
  "executionId": "2024-01-15T10-30-00-abc123"
}
```

## Benefits Over File-Based Logging

1. **Persistence**: Logs survive server restarts and deployments
2. **Queryability**: Complex queries and aggregations possible
3. **Integration**: Seamless integration with existing MongoDB infrastructure
4. **Scalability**: Better performance with large log volumes
5. **API Access**: Programmatic access to log data
6. **Indexing**: Optimized for fast queries
7. **Backup**: Automatic backup with database backups
8. **Monitoring**: Easy integration with monitoring tools

## Maintenance

### Automatic Cleanup

The system includes automatic cleanup functionality to prevent the collection from growing indefinitely:

```typescript
// Clean up old logs, keeping only the last 100 entries
await MongoCronLogger.cleanupOldLogs("weeklyLeadProcessor", 100);
```

### Monitoring

Monitor the collection size and performance:

```javascript
// Check collection stats
db.leads_cron_logs.stats()

// Count documents by status
db.leads_cron_logs.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

## Troubleshooting

### Common Issues

1. **Index Creation Fails**: Ensure MongoDB connection is established
2. **Logging Errors**: Check MongoDB connection and permissions
3. **Performance Issues**: Verify indexes are created correctly

### Debugging

Enable debug logging to troubleshoot issues:

```typescript
// In your application
logger.level = 'debug';
```

## Future Enhancements

Potential improvements for the future:

1. **Log Retention Policies**: Automatic cleanup based on age
2. **Alerting**: Integration with monitoring systems
3. **Dashboards**: Web-based log viewing interface
4. **Export**: Export logs to external systems
5. **Analytics**: Advanced analytics and reporting
