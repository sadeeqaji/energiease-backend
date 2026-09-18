import jwt from 'jsonwebtoken';
import env from '@/config/env';

const JWT_SECRET = env.JWT_SECRET || 'energiease-jwt-secret-key-change-in-prod';

/**
 * Generate a JWT token.
 * @param payload - The payload to include in the token.
 * @returns The generated JWT token.
 */
export const generateToken = (payload: {
  user_id: string;
  role: string;
}): string => {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
};

/**
 * Verify a JWT token.
 * @param token - The JWT token to verify.
 * @returns The decoded token payload.
 */
export const verifyToken = (
  token: string,
): { user_id: string; role: string } => {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
    user_id: string;
    role: string;
  };
};

export const generateRefreshToken = (user_id: string): string => {
  return jwt.sign({ user_id }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
};

/**
 * Verify a refresh token using the public key.
 * @param token - The refresh token to verify.
 * @returns The decoded token payload.
 */
export const verifyRefreshToken = (token: string): { user_id: string } => {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
    user_id: string;
  };
};

