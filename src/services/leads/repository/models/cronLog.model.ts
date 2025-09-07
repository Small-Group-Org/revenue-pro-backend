import { Schema, model, Document } from 'mongoose';

export interface ICronLog {
  jobName: string;
  status: 'started' | 'success' | 'failure';
  startedAt: Date;
  finishedAt?: Date;
  details: string | object; // Can be narrative string or quantified metrics object
  processedCount?: number;
  error?: string;
  executionId?: string; // For tracking related log entries
}

export interface ICronLogDocument extends ICronLog, Document {}

const cronLogSchema = new Schema<ICronLogDocument>(
  {
    jobName: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: ['started', 'success', 'failure']
    },
    startedAt: {
      type: Date,
      required: true
    },
    finishedAt: {
      type: Date,
      required: false
    },
    details: {
      type: Schema.Types.Mixed, // Allows both string and object
      required: true
    },
    processedCount: {
      type: Number,
      required: false
    },
    error: {
      type: String,
      required: false
    },
    executionId: {
      type: String,
      required: false
    }
  },
  { 
    timestamps: true,
    collection: 'leads_cron_logs'
  }
);

// Create compound indexes for efficient querying
cronLogSchema.index({ jobName: 1, startedAt: -1 });
cronLogSchema.index({ status: 1, startedAt: -1 });
cronLogSchema.index({ executionId: 1 });

// Create individual indexes for common query patterns
cronLogSchema.index({ jobName: 1 });
cronLogSchema.index({ startedAt: -1 });
cronLogSchema.index({ finishedAt: -1 });

export default model<ICronLogDocument>('CronLog', cronLogSchema);
