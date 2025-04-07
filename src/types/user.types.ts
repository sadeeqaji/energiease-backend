import { Document } from 'mongoose';

export type Status = 'pending' | 'verified' | 'rejected';
export type MandateStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export interface BankAccount {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export interface Mandate {
  mandateReference: string;
  mandateCode?: string;
  bankAccount: string | BankAccount;
  status: MandateStatus;
  expiryDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface User extends Document {
  firstName: string;
  middleName: string;
  lastName: string;
  phoneNumber: string;
  gender: 'male' | 'female';
  mandates?: Mandate[];
  createdAt: Date;
  updatedAt: Date;
}