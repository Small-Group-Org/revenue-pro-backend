import { IActual } from '../../domain/actual.domain.js';
import { Document, Schema, model } from 'mongoose';

export interface IActualDocument extends IActual, Document {}

const actualSchema = new Schema<IActualDocument>({
    weekStartDate: { type: Date, required: true },
    leads: { type: Number, required: true },
    estimatesSet: { type: Number, required: true },
    estimatesRan: { type: Number, required: true },
    jobsBooked: { type: Number, required: true },
    revenue: { type: Number, required: true },
    budgetSpent: { type: Number, required: true },
});

export default model<IActualDocument>('Actual', actualSchema);