import UserModel from '@/models/user.model';
import mongoose, { ProjectionType, QueryOptions } from 'mongoose';
import { AppException } from '@/utils/appException.utils';
import { User } from '@/types/user.types';
import {
  FilterQuery,
  UpdateQuery,
  ClientSession,
  ModifyResult
} from 'mongoose';

export class UserService {


  /**
  * Find a single user document with flexible querying
  * @param filter - MongoDB filter query
  * @param projection - Optional fields to include/exclude
  * @param options - Query options
  */
  async findOne(
    filter: FilterQuery<User>,
    projection?: ProjectionType<User>,
    options?: QueryOptions<User>
  ): Promise<User & mongoose.Document | null> {
    try {
      return await UserModel.findOne(filter, projection, options)
        .select('+bankAccounts +mandates') // Always include these for direct debit
        .exec();
    } catch (error) {
      throw AppException.InternalServerError('Failed to fetch user');
    }
  }

  /**
   * Get user by ID or phone number
   * @param identifier - User ID or phone number
   */
  async getUserByIdentifier(identifier: string) {
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      return await UserModel.findById(identifier);
    }
    return await UserModel.findOne({ phoneNumber: identifier });
  }

  /**
   * Update basic user information
   * @param userId - User ID
   * @param fields - Fields to update
   */
  async updateUserProfile(
    userId: string,
    fields: {
      firstName?: string;
      lastName?: string;
      address?: string;
      phoneNumber?: string;
    }
  ) {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: fields },
      { new: true, runValidators: true }
    );

    if (!user) throw AppException.NotFound('User not found');
    return user;
  }


  /**
 * Updates user document(s) with strict typing for direct debit operations
 * @param filter - Filter query (e.g., { phoneNumber: string })
 * @param update - Update operations (e.g., { $push: { mandates: {...} })
 * @param options - MongoDB update options
 */
  // services/user.service.ts
  async update(
    filter: FilterQuery<User>,
    update: UpdateQuery<User>,
    options: {
      upsert?: boolean;
      session?: ClientSession;
      returnDocument?: 'before' | 'after';
    } = { returnDocument: 'after' }
  ): Promise<User | null> {
    const result = await UserModel.findOneAndUpdate(
      filter,
      update,
      {
        ...options,
        new: options.returnDocument === 'after',
        runValidators: true
      }
    );

    if (!result && !options.upsert) {
      throw AppException.NotFound('No user found matching the criteria');
    }

    return result;
  }


  /**
   * Create new user (phone number registration only)
   * @param phoneNumber - User's phone number
   */
  async createUser(phoneNumber: string) {
    return await UserModel.create({
      phoneNumber,
      verified: false
    });
  }


  /**
 * Find user by active mandate
 * @param accountNumber - Bank account number
 * @param bankCode - Bank code
 */
  async findByActiveMandate(
    accountNumber: string,
    bankCode: string
  ): Promise<User & mongoose.Document | null> {
    return UserModel.findOne({
      'mandates.bankAccount.accountNumber': accountNumber,
      'mandates.bankAccount.bankCode': bankCode,
      'mandates.status': 'active',
      'mandates.expiryDate': { $gt: new Date() }
    });
  }


}

// export default new UserService();