/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * This script generates a public and private key pair.
 * - Copy the private key into your .env file.
 * - Upload the public key to your Meta account.
 *
 * Run this script using:
 *     tsx src/keyGenerator.ts {passphrase}
 */

import crypto from 'crypto';
// Retrieve passphrase from command-line arguments
const passphrase = 'N7&^%&2422s_|?2AT1CSJ';

if (!passphrase) {
  console.error(
    '❌ Error: Passphrase is required.\nUsage: tsx src/keyGenerator.ts {passphrase}',
  );
  process.exit(1);
}

try {
  // Generate RSA key pair
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase,
    },
  });

  console.log('\n✅ Key Pair Generated Successfully!');
  console.log('\n🔑 Public Key:\n', keyPair.publicKey);
  console.log('\n🔒 Private Key (Keep this secret!):\n', keyPair.privateKey);
} catch (error) {
  console.error('❌ Error generating keys:', error);
  process.exit(1);
}
