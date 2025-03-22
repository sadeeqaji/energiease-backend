import mongoose, { Schema, Model } from 'mongoose';
import {
    AirtimeDetails,
    BillDetails,
    BillType,
    CableDetails,
    ElectricityDetails,
    WaterDetails
} from "@/types/bill.types";
import { Order } from '@/types/order.types';
import { serviceFee } from '@/constants/serviceFee';



const OrderSchema: Schema<Order> = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    customerPhone: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: Object.values(BillType),
        required: true
    },
    details: {
        type: Schema.Types.Mixed,
        required: true,
        validate: {
            validator: function (details: BillDetails) {
                return validateDetails(this.type, details);
            },
            message: 'Invalid details structure for this bill type'
        }
    },
    provider: {
        type: String,
        enum: ['buypower', 'vtpass', 'none'],
        default: 'none'
    },
    providerResponse: {
        type: Schema.Types.Mixed,
        default: {}
    },
    amount: {
        type: Number,
        required: true,
        min: [1000 + serviceFee, `Total amount must be at least ${1000 + serviceFee} Naira`]
    },
    serviceFee: {
        type: Number,
        required: true,
        default: serviceFee
    },
    status: {
        type: String,
        enum: ['pending_payment', 'processing', 'success', 'failed'],
        default: 'pending_payment'
    },
    retries: {
        type: Number,
        default: 0,
        max: [3, 'Maximum retries exceeded']
    },
    providerOrderId: String,
    reference: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    paymentConfirmedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    index: [
        { reference: 1 },
        { user: 1, status: 1 },
        { provider: 1, status: 1 },
        { type: 1, status: 1 },
        { createdAt: -1 }
    ]
});

function validateDetails(billType: BillType, details: BillDetails): boolean {
    switch (billType) {
        case BillType.ELECTRICITY:
            return validateElectricityDetails(details as ElectricityDetails);
        case BillType.AIRTIME:
            return validateAirtimeDetails(details as AirtimeDetails);
        case BillType.CABLE:
            return validateCableDetails(details as CableDetails);
        case BillType.WATER:
            return validateWaterDetails(details as WaterDetails);
        default:
            return false;
    }
}

function validateElectricityDetails(details: ElectricityDetails): boolean {
    return !!details.meterNumber &&
        !!details.disco &&
        ['prepaid', 'postpaid'].includes(details.vendType.toLowerCase()) &&
        typeof details.meterNumber === 'string' &&
        /^\d{10,13}$/.test(details.meterNumber);
}

function validateAirtimeDetails(details: AirtimeDetails): boolean {
    return !!details.phone &&
        !!details.network &&
        typeof details.amount === 'number' &&
        details.amount >= 50 &&
        /^\+?\d{7,15}$/.test(details.phone);
}

function validateCableDetails(details: CableDetails): boolean {
    return !!details.smartcard &&
        !!details.package &&
        typeof details.months === 'number' &&
        details.months > 0 &&
        details.months <= 12;
}

function validateWaterDetails(details: WaterDetails): boolean {
    return !!details.accountNumber &&
        !!details.utility &&
        typeof details.accountNumber === 'string' &&
        details.accountNumber.length >= 8;
}

OrderSchema.virtual('formattedResponse').get(function () {
    return {
        id: this._id,
        type: this.type,
        amount: this.amount,
        status: this.status,
        provider: this.provider,
        reference: this.reference,
        retries: this.retries,
        createdAt: this.createdAt,
        paymentConfirmedAt: this.paymentConfirmedAt,
        providerOrderId: this.providerOrderId
    };
});

OrderSchema.statics.findByReference = function (reference: string) {
    return this.findOne({ reference });
};

const OrderModel: Model<Order> = mongoose.model<Order>('Order', OrderSchema);

export default OrderModel;