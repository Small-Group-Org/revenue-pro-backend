import { Schema, model, } from 'mongoose';
const ticketSchema = new Schema({
    userId: {
        type: String,
        required: true,
        ref: 'User'
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
        enum: ['open', 'in_progress', 'closed'],
        default: 'open'
    },
    priority: {
        type: String,
        required: true,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    }
}, {
    timestamps: true,
});
// Create indexes for efficient querying
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ updatedat: -1 });
ticketSchema.index({ status: 1, priority: 1 });
const Ticket = model('Ticket', ticketSchema);
export default Ticket;
