import { Schema, model } from 'mongoose';
const weeklyActualSchema = new Schema({
    userId: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    testingBudgetSpent: { type: Number, required: true },
    awarenessBrandingBudgetSpent: { type: Number, required: true },
    leadGenerationBudgetSpent: { type: Number, required: true },
    metaBudgetSpent: { type: Number, default: null }, // Optional field for Meta (Facebook) Ads integration budget
    revenue: { type: Number, required: true },
    sales: { type: Number, required: true }, // updated
    leads: { type: Number, required: true }, // new field
    estimatesRan: { type: Number, required: true },
    estimatesSet: { type: Number, required: true },
    adNamesAmount: {
        type: [
            {
                adName: { type: String, required: true },
                budget: { type: Number, required: true, default: 0 },
                _id: false, // Disable automatic _id generation for subdocuments
            },
        ],
        default: [],
    },
}, { timestamps: true });
// Enforce uniqueness on (userId + startDate)
weeklyActualSchema.index({ userId: 1, startDate: 1 }, { unique: true });
export default model('WeeklyActual', weeklyActualSchema);
