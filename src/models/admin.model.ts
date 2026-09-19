import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { Admin } from '@/types/admin.types';

const AdminSchema: Schema<Admin> = new Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'support', 'accounting'],
    default: 'admin',
  },
  permissions: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

AdminSchema.pre<Admin>('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

AdminSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

const AdminModel: Model<Admin> = mongoose.model<Admin>('Admin', AdminSchema);

export default AdminModel;
