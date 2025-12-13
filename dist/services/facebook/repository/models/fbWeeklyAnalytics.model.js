import { Schema, model } from 'mongoose';
const fbWeeklyAnalyticsSchema = new Schema({
    // Client & Account Info
    clientId: { type: String, required: true, index: true },
    facebookAdAccountId: { type: String, required: true },
    // Campaign Hierarchy (Readable Names)
    campaignId: { type: String, required: true, index: true },
    campaignName: { type: String, required: true },
    adSetId: { type: String, required: true },
    adSetName: { type: String, required: true },
    adId: { type: String, required: true, index: true },
    adName: { type: String, required: true },
    // Creative Content
    creative: {
        type: {
            id: { type: String, default: null },
            name: { type: String, default: null },
            primaryText: { type: String, default: null },
            headline: { type: String, default: null },
            rawData: { type: Schema.Types.Mixed, default: null }
        },
        default: null
    },
    // Lead Form
    leadForm: {
        type: {
            id: { type: String, required: true },
            name: { type: String, required: true }
        },
        default: null
    },
    // Performance Metrics
    metrics: {
        type: {
            // Basic Performance
            impressions: { type: Number, required: true, default: 0 },
            reach: { type: Number, default: 0 },
            frequency: { type: Number, default: 0 },
            clicks: { type: Number, required: true, default: 0 },
            unique_clicks: { type: Number, default: 0 },
            ctr: { type: Number, default: 0 },
            unique_ctr: { type: Number, default: 0 },
            // Costs
            spend: { type: Number, required: true, default: 0 },
            cpc: { type: Number, default: 0 },
            cpm: { type: Number, default: 0 },
            cpr: { type: Number, default: 0 },
            // Engagement
            post_engagements: { type: Number, default: 0 },
            post_reactions: { type: Number, default: 0 },
            post_saves: { type: Number, default: 0 },
            post_shares: { type: Number, default: 0 },
            page_engagements: { type: Number, default: 0 },
            link_clicks: { type: Number, default: 0 },
            // Video Performance
            video_views: { type: Number, default: 0 },
            video_views_25pct: { type: Number, default: 0 },
            video_views_50pct: { type: Number, default: 0 },
            video_views_75pct: { type: Number, default: 0 },
            video_views_100pct: { type: Number, default: 0 },
            video_avg_watch_time: { type: Number, default: 0 },
            video_play_actions: { type: Number, default: 0 },
            // Conversions
            total_conversions: { type: Number, default: 0 },
            conversion_value: { type: Number, default: 0 },
            cost_per_conversion: { type: Number, default: 0 },
            // Leads
            total_leads: { type: Number, default: 0 },
            cost_per_lead: { type: Number, default: 0 }
        },
        required: true
    },
    // Week Period (Always weekly)
    weekStartDate: { type: String, required: true, index: true },
    weekEndDate: { type: String, required: true, index: true },
    // Metadata
    savedAt: { type: Date, default: Date.now },
    dataSource: { type: String, enum: ['facebook_api', 'manual_upload'], default: 'facebook_api' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });
// Compound indexes for efficient queries
fbWeeklyAnalyticsSchema.index({ clientId: 1, weekStartDate: 1, weekEndDate: 1 });
fbWeeklyAnalyticsSchema.index({ clientId: 1, adId: 1, weekStartDate: 1 }, { unique: true });
fbWeeklyAnalyticsSchema.index({ clientId: 1, campaignId: 1, weekStartDate: 1 });
export default model('FbWeeklyAnalytics', fbWeeklyAnalyticsSchema);
