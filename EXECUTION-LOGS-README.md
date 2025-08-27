# Weekly Cron Job Execution Logs

A simple JSON-based logging system to track weekly cron job execution results. Perfect for developers and PMs to monitor the health of weekly conversion rate updates.

## 📁 **File Structure**

```
execution-logs/
├── latest.json                    # Always contains the most recent execution
├── weekly-cron-2024-08-27T14-30-00.json  # Timestamped execution files
├── weekly-cron-2024-08-20T14-30-00.json
└── weekly-cron-2024-08-13T14-30-00.json
```

## 📊 **What Gets Logged**

Every weekly cron execution creates a detailed JSON file containing:

### **Execution Metadata**
- Execution ID and timestamp
- Start/end times and total duration
- Overall status (SUCCESS/PARTIAL_SUCCESS/FAILED)

### **Processing Summary**
- Number of clients processed
- Success rate percentage
- Successful vs failed clients

### **Data Updates**
- Total conversion rates processed
- Total leads updated
- **NEW: Conversion Rate Database Insights**
  - New CR records inserted vs existing records updated
  - Insert rate percentage for tracking data growth
- Detailed client-by-client results with CR statistics

### **Error Tracking**
- All errors encountered during execution
- Client-specific error details
- Processing duration per client

## 🔍 **Sample Log File**

```json
{
  "executionId": "2024-08-27T14-30-00-123Z",
  "executionDate": "2024-08-27",
  "startTime": "2024-08-27T14:30:00.123Z",
  "endTime": "2024-08-27T14:32:15.456Z",
  "duration": 135333,
  "processedClients": 20,
  "totalUpdatedConversionRates": 3450,
  "totalUpdatedLeads": 25000,
  "successfulClients": 19,
  "failedClients": 1,
  "successRate": "95%",
  "status": "PARTIAL_SUCCESS",
  "conversionRateInsights": {
    "totalProcessed": 3450,
    "newInserts": 892,
    "updated": 2558,
    "insertRate": "26%"
  },
  "errors": [
    "[CR Update] Error updating conversion rates for clientId ABC123: Database timeout"
  ],
  "clientResults": [
    {
      "clientId": "CLIENT001",
      "success": true,
      "updatedConversionRates": 150,
      "updatedLeads": 1200,
      "errors": [],
      "duration": 5500,
      "conversionRateStats": {
        "newInserts": 45,
        "updated": 105
      }
    },
    {
      "clientId": "ABC123", 
      "success": false,
      "updatedConversionRates": 0,
      "updatedLeads": 0,
      "errors": ["Database timeout"],
      "duration": 30000,
      "conversionRateStats": {
        "newInserts": 0,
        "updated": 0
      }
    }
  ]
}
```

## 🚀 **How to Check Results**

### **1. Quick Check - Latest Result**
```bash
cat execution-logs/latest.json | jq
```

### **2. View All Recent Executions**
```bash
ls -la execution-logs/
```

### **3. Check Success Rate**
```bash
cat execution-logs/latest.json | jq '.successRate'
```

### **4. View Errors Only**
```bash
cat execution-logs/latest.json | jq '.errors[]'
```

### **5. Client-Specific Results**
```bash
cat execution-logs/latest.json | jq '.clientResults[] | select(.success == false)'
```

## 📋 **Console Output**

In addition to JSON files, each execution prints a formatted summary to the console:

```
✅ Weekly Cron Execution Summary (2024-08-27)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Processing Results:
   • Processed Clients: 20
   • Success Rate: 95%
   • Successful: 19 | Failed: 1

📈 Data Updates:
   • Conversion Rates Processed: 3,450
   • Leads Updated: 25,000
   • Duration: 135s

🔄 Conversion Rate Database Insights:
   • Total CR Records: 3,450
   • New Insertions: 892 (26%)
   • Updated Records: 2,558

❌ Errors (1):
   • [CR Update] Error updating conversion rates for clientId ABC123: Database timeout

📁 Result saved to: execution-logs/weekly-cron-2024-08-27T14-30-00-123Z.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🔧 **Features**

### **Automatic Cleanup**
- Keeps only the last 30 execution logs
- Automatically deletes older files
- Always maintains `latest.json`

### **Error-Safe**
- Logging failures don't break cron execution
- Graceful handling of file system errors
- Continues processing even if logging fails

### **Developer Friendly**
- Human-readable JSON format
- Easy to parse with `jq` or scripts
- Timestamped filenames for easy sorting

## 📅 **When Logs Are Created**

Logs are created automatically:
- ✅ **Every Sunday at 2:00 AM UTC** (scheduled cron)
- ✅ **Manual API triggers** (`/api/v1/trigger-lead-sheet-computation`)
- ✅ **Test cron executions** (if enabled)

## 🛠️ **For Developers**

### **Reading Logs Programmatically**
```typescript
import executionLogger from './src/utils/executionLogger.js';

// Get latest result
const latest = executionLogger.getLatestResult();

// Get all results (last 30)
const allResults = executionLogger.getAllResults();
```

### **Status Codes**
- `SUCCESS`: All clients processed without errors
- `PARTIAL_SUCCESS`: Some clients failed, but others succeeded
- `FAILED`: All clients failed or critical system error

### **File Naming Convention**
- Format: `weekly-cron-YYYY-MM-DDTHH-MM-SS.json`
- Always UTC timestamps
- Special characters replaced with hyphens

## 🎯 **Perfect for PM/Dev Reviews**

1. **Monday Morning Check**: Review Sunday's execution via `latest.json`
2. **Weekly Reports**: Aggregate data from multiple executions
3. **Error Tracking**: Identify recurring client issues
4. **Performance Monitoring**: Track processing times and data volumes
5. **Capacity Planning**: Monitor growth in clients and data

This logging system gives you complete visibility into your weekly cron job performance without any complexity! 🎉
