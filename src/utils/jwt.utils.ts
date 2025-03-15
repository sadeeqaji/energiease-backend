import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

const privateKey = fs.readFileSync(
  path.resolve(__dirname, '../../keys/accessTokenPrivate.key'),
);
const publicKey = fs.readFileSync(
  path.resolve(__dirname, '../../keys/accessTokenPublic.key'),
);

/**
 * Generate a JWT token.
 * @param payload - The payload to include in the token.
 * @returns The generated JWT token.
 */
export const generateToken = (payload: {
  user_id: string;
  role: string;
}): string => {
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
};

/**
 * Verify a JWT token.
 * @param token - The JWT token to verify.
 * @returns The decoded token payload.
 */
export const verifyToken = (
  token: string,
): { user_id: string; role: string } => {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as {
    user_id: string;
    role: string;
  };
};

export const generateRefreshToken = (user_id: string): string => {
  return jwt.sign({ user_id }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '7d',
  });
};

/**
 * Verify a refresh token using the public key.
 * @param token - The refresh token to verify.
 * @returns The decoded token payload.
 */
export const verifyRefreshToken = (token: string): { user_id: string } => {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as {
    user_id: string;
  };
};
