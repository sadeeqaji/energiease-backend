import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const KEYS_DIR = path.resolve(__dirname, '../../keys');
const privateKeyPath = path.join(KEYS_DIR, 'accessTokenPrivate.key');
const publicKeyPath = path.join(KEYS_DIR, 'accessTokenPublic.key');

function getOrGenerateKeys(): { privateKey: string | Buffer; publicKey: string | Buffer } {
  if (process.env.ACCESS_TOKEN_PRIVATE_KEY && process.env.ACCESS_TOKEN_PUBLIC_KEY) {
    return {
      privateKey: process.env.ACCESS_TOKEN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      publicKey: process.env.ACCESS_TOKEN_PUBLIC_KEY.replace(/\\n/g, '\n')
    };
  }

  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    return {
      privateKey: fs.readFileSync(privateKeyPath),
      publicKey: fs.readFileSync(publicKeyPath)
    };
  }

  try {
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true });
    }

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });

    fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o644 });

    return { privateKey, publicKey };
  } catch {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    return { privateKey, publicKey };
  }
}

const { privateKey, publicKey } = getOrGenerateKeys();

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
