import fs from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'crypto';
import logger from './logger';

const KEYS_DIR = path.resolve(__dirname, '../../keys');

function generateKeyPair(fileNamePrefix: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });

  fs.writeFileSync(
    path.join(KEYS_DIR, `${fileNamePrefix}Private.key`),
    privateKey,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );

  fs.writeFileSync(
    path.join(KEYS_DIR, `${fileNamePrefix}Public.key`),
    publicKey,
    {
      encoding: 'utf8',
      mode: 0o644,
    },
  );

  logger.info(`Keys for '${fileNamePrefix}' generated successfully.`);
}

function main() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    logger.info(`Created 'keys' directory at ${KEYS_DIR}`);
  }

  const filesToCheck = [
    path.join(KEYS_DIR, 'accessTokenPrivate.key'),
    path.join(KEYS_DIR, 'accessTokenPublic.key'),
    // path.join(KEYS_DIR, 'refreshTokenPrivate.key'),
    // path.join(KEYS_DIR, 'refreshTokenPublic.key'),
  ];

  const missingFiles = filesToCheck.filter(
    (filePath) => !fs.existsSync(filePath),
  );

  if (missingFiles.length > 0) {
    logger.error('Some key files are missing. Generating keys...');
    generateKeyPair('accessToken');
    // generateKeyPair('refreshToken');
  } else {
    logger.info('All key files already exist. No need to generate new keys.');
  }
}

main();
