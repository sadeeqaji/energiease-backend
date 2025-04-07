import mongoose, { Schema, Model } from 'mongoose';
import { User } from '@/types/user.types';



const MandateSchema = new Schema({
    mandateReference: {
        type: String,
        required: true,
        unique: true
    },
    mandateCode: {
        type: String
    },
    bankAccount: {
        bankCode: String,
        accountNumber: String,
        accountName: String
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'cancelled', 'expired'],
        default: 'pending'
    },
    expiryDate: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const UserSchema: Schema<User> = new Schema({
    firstName: {
        type: String,
    },
    middleName: {
        type: String,
    },
    lastName: {
        type: String,
    },
    gender: {
        type: String,
        enum: ['male', 'female'],
    },
    phoneNumber: {
        type: String,
        unique: true,
        required: true,
    },
    mandates: [MandateSchema]
}, { timestamps: true });

const UserModel: Model<User> = mongoose.model<User>('User', UserSchema);

export default UserModel;