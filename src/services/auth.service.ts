import AdminModel from '@/models/admin.model';
import { Admin } from '@/types/admin.types';
import { AppException } from '@/utils/appException.utils';
import {
  generateToken,
  verifyToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@/utils/jwt.utils';

class AuthService {
  async register(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<Admin> {
    const { firstName, lastName, email, password } = userData;

    const existingUser = await AdminModel.findOne({ email });
    if (existingUser) {
      AppException.Conflict('User already exists');
    }
    const user = new AdminModel({
      firstName,
      lastName,
      email,
      password,
    });

    await user.save();
    return user;
  }

  /**
   * Login a user and return access and refresh tokens.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await AdminModel.findOne({ email });
    if (!user) {
      throw AppException.NotFound('User not found');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw AppException.BadRequest('Invalid credentials');
    }

    const accessToken = generateToken({
      user_id: user._id.toString(),
      role: user.role,
    });
    const refreshToken = generateRefreshToken(user._id.toString());

    return { accessToken, refreshToken };
  }

  /**
   * Refresh an access token using a refresh token.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    const { user_id } = verifyRefreshToken(refreshToken);

    const user = await AdminModel.findById(user_id);
    if (!user) {
      throw AppException.NotFound('User not found');
    }

    const accessToken = generateToken({
      user_id: user._id.toString(),
      role: user.role,
    });

    return { accessToken };
  }

  async verifyToken(token: string): Promise<{ user_id: string; role: string }> {
    return verifyToken(token);
  }
}

export default new AuthService();
