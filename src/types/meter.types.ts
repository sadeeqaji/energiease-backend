import mongoose, { Document } from 'mongoose';

export interface Meter extends Document {
    meterNumber: string;
    user: mongoose.Types.ObjectId;
    name: string;
    phoneNumber: string;
    address: string;
    discoCode: string;
    vendType: string;
    createdAt: Date;
}

