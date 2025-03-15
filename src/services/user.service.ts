import UserModel from '@/models/user.model';
import mongoose from 'mongoose';
import { AppException } from '@/utils/appException.utils';

class UserService {
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
   * Create new user (phone number registration only)
   * @param phoneNumber - User's phone number
   */
  async createUser(phoneNumber: string) {
    return await UserModel.create({
      phoneNumber,
      verified: false
    });
  }
}

export default new UserService();