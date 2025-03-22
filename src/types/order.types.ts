import mongoose, { Document } from 'mongoose';
import { BillDetails, BillType } from './bill.types';

export interface Order extends Document {
    user: mongoose.Types.ObjectId;
    customerPhone: string;
    type: BillType;
    details: BillDetails;
    provider: 'buypower' | 'vtpass' | 'none';
    providerResponse: Record<string, unknown>;
    amount: number;
    serviceFee: number;
    status: 'pending_payment' | 'processing' | 'success' | 'failed';
    retries: number;
    providerOrderId?: string;
    reference: string;
    paymentConfirmedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}