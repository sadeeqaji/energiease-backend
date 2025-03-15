import { Document } from 'mongoose';

export type Status = 'pending' | 'verified' | 'rejected';



export interface User extends Document {
  firstName: string;
  middleName: string;
  lastName: string;
  phoneNumber: string;
  gender: 'male' | 'female';
  createdAt: Date;
  updatedAt: Date;
}
