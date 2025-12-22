import mongoose, { Schema } from "mongoose";
const ghlClientSchema = new Schema({
    locationId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    encryptedApiToken: {
        type: String,
        required: true,
    },
    queryValue: {
        type: String,
        required: true,
    },
    customFieldId: {
        type: String,
        required: false,
    },
    queryValue2: {
        type: String,
        required: false,
    },
    customFieldId2: {
        type: String,
        required: false,
    },
    // Tag-based date custom field IDs
    apptBookedTagDateFieldId: {
        type: String,
        required: false,
    },
    jobWonTagDateFieldId: {
        type: String,
        required: false,
    },
    jobLostTagDateFieldId: {
        type: String,
        required: false,
    },
    apptCompletedTagDateFieldId: {
        type: String,
        required: false,
    },
    disqualifiedTagDateFieldId: {
        type: String,
        required: false,
    },
    pipelineId: {
        type: String,
        required: true,
    },
    revenueProClientId: {
        type: String,
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ['active', 'deleted', 'inactive'],
        default: 'active',
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
});
const GhlClient = mongoose.model("GhlClient", ghlClientSchema);
export default GhlClient;
