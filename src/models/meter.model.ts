import { Meter } from '@/types/meter.types';
import mongoose, { Schema, Model, Document } from 'mongoose';


const MeterSchema: Schema<Meter> = new Schema({
    meterNumber: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    phoneNumber: { type: String, required: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    discoCode: { type: String, required: true },
    vendType: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

const MeterModel: Model<Meter> = mongoose.model<Meter>('Meter', MeterSchema);

export { MeterModel, Meter };