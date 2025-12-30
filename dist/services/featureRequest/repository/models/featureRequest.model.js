import { Schema, model } from 'mongoose';
const featureRequestSchema = new Schema({
    userId: {
        type: String,
        required: true,
        ref: 'User'
    },
    userName: {
        type: String,
        required: true,
        trim: true
    },
    userEmail: {
        type: String,
        required: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    status: {
        type: String,
        required: true,
        enum: ['new', 'accepted', 'rejected', 'information_needed'],
        default: 'new'
    }
}, {
    timestamps: true
});
// Create indexes for efficient querying
featureRequestSchema.index({ userId: 1, status: 1 });
featureRequestSchema.index({ createdAt: -1 });
featureRequestSchema.index({ status: 1 });
const FeatureRequest = model('FeatureRequest', featureRequestSchema);
export default FeatureRequest;
