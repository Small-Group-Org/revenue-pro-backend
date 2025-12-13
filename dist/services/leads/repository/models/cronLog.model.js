import { Schema, model } from 'mongoose';
const cronLogSchema = new Schema({
    jobName: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['started', 'processing', 'success', 'failure']
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
    },
    type: {
        type: String,
        required: false,
        enum: ['manual', 'cron']
    }
}, {
    timestamps: true,
    collection: 'leads_cron_logs'
});
// Create compound indexes for efficient querying
cronLogSchema.index({ jobName: 1, startedAt: -1 });
cronLogSchema.index({ status: 1, startedAt: -1 });
cronLogSchema.index({ executionId: 1 });
cronLogSchema.index({ type: 1, startedAt: -1 });
// Create individual indexes for common query patterns
cronLogSchema.index({ jobName: 1 });
cronLogSchema.index({ startedAt: -1 });
cronLogSchema.index({ finishedAt: -1 });
export default model('CronLog', cronLogSchema);
