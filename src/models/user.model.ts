import mongoose, { Schema, Model } from 'mongoose';
import { User } from '@/types/user.types';




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

});




const UserModel: Model<User> = mongoose.model<User>('User', UserSchema);

export default UserModel;
