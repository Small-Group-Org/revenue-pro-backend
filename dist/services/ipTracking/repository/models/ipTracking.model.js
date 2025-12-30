import mongoose, { Schema } from "mongoose";
const ipTrackingSchema = new Schema({
    ipAddress: {
        type: String,
        required: true,
    },
    hashedIp: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
    },
    userId: {
        type: String,
        required: true,
    },
    userAgent: {
        type: String,
        required: false,
    },
    referer: {
        type: String,
        required: false,
    },
    acceptLanguage: {
        type: String,
        required: false,
    },
    // IP headers for audit trail
    forwardedFor: {
        type: String,
        required: false,
    },
    realIp: {
        type: String,
        required: false,
    },
    clientIp: {
        type: String,
        required: false,
    },
    cfConnectingIp: {
        type: String,
        required: false,
    },
    // Additional metadata
    sessionId: {
        type: String,
        required: false,
    },
    termsVersion: {
        type: String,
        required: false,
    },
    acceptanceMethod: {
        type: String,
        enum: ['web', 'mobile', 'api'],
        default: 'web',
        required: false,
    },
    // Integrity hash for tamper detection
    integrityHash: {
        type: String,
        required: true,
    },
}, {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
});
// Create index for efficient queries
ipTrackingSchema.index({ userId: 1, timestamp: -1 });
ipTrackingSchema.index({ ipAddress: 1, timestamp: -1 });
ipTrackingSchema.index({ hashedIp: 1, timestamp: -1 });
ipTrackingSchema.index({ sessionId: 1, timestamp: -1 });
ipTrackingSchema.index({ termsVersion: 1, timestamp: -1 });
ipTrackingSchema.index({ acceptanceMethod: 1, timestamp: -1 });
const IPTracking = mongoose.model("IPTracking", ipTrackingSchema);
export default IPTracking;
