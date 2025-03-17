import crypto from 'crypto';
import axios from 'axios';
import { WhatsAppMedia } from '@/types/whatsapp.types';
import { WithImplicitCoercion } from 'buffer';

const base64ToBuffer = (
  base64:
    | WithImplicitCoercion<string>
    | { [Symbol.toPrimitive](hint: 'string'): string },
) => Buffer.from(base64, 'base64');

export const decryptWhatsAppFile = async (file: WhatsAppMedia) => {
  try {
    const {
      cdn_url,
      encryption_metadata: {
        encrypted_hash,
        iv: ivBase64,
        encryption_key: encKeyBase64,
        hmac_key: hmacKeyBase64,
        plaintext_hash,
      },
    } = file;

    console.log('Step 1: Downloading file from CDN...');
    const response = await axios.get(cdn_url, { responseType: 'arraybuffer' });
    const cdnFile = Buffer.from(response.data);
    console.log('Downloaded File Size:', cdnFile.length);

    console.log('Step 2: Validating encrypted file hash...');
    const cdnFileHash = crypto.createHash('sha256').update(cdnFile).digest();
    if (!cdnFileHash.equals(base64ToBuffer(encrypted_hash))) {
      throw new Error('Encrypted file hash mismatch');
    }

    console.log('Step 3: Splitting ciphertext and HMAC...');
    const hmac10 = cdnFile.slice(-10);
    const ciphertext = cdnFile.slice(0, -10);

    console.log('Step 4: Validating HMAC...');
    const hmacKey = base64ToBuffer(hmacKeyBase64);
    const iv = base64ToBuffer(ivBase64);

    const calculatedHmac = crypto
      .createHmac('sha256', hmacKey)
      .update(iv)
      .update(ciphertext)
      .digest()
      .slice(0, 10);

    console.log('Expected HMAC (first 10 bytes):', hmac10.toString('hex'));
    console.log(
      'Calculated HMAC (first 10 bytes):',
      calculatedHmac.toString('hex'),
    );

    if (!calculatedHmac.equals(hmac10)) {
      throw new Error('HMAC validation failed');
    }

    console.log('Step 5: Decrypting media content...');
    const encKey = base64ToBuffer(encKeyBase64);
    const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
    let decryptedMedia = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    console.log(
      'Decrypted Media (first 20 bytes):',
      decryptedMedia.slice(0, 20).toString('hex'),
    );

    // Remove PKCS7 padding (optional)
    console.log('Step 6: Checking PKCS7 padding...');

    const padding = decryptedMedia[decryptedMedia.length - 1];
    console.log('Padding byte:', padding);

    // Validar si el padding parece correcto antes de removerlo
    if (padding > 0 && padding <= 16) {
      const expectedPadding = Buffer.alloc(padding, padding);
      const actualPadding = decryptedMedia.slice(-padding);

      if (actualPadding.equals(expectedPadding)) {
        console.log('Valid PKCS7 padding detected. Removing it...');
        decryptedMedia = decryptedMedia.slice(0, -padding);
      } else {
        console.log(
          'Padding does not match PKCS7 pattern. Keeping full decrypted content.',
        );
      }
    }

    console.log('Step 7: Validating decrypted media hash...');
    const decryptedHash = crypto
      .createHash('sha256')
      .update(decryptedMedia)
      .digest();
    console.log(
      'Expected Plaintext Hash:',
      base64ToBuffer(plaintext_hash).toString('hex'),
    );
    console.log('Calculated Plaintext Hash:', decryptedHash.toString('hex'));

    if (!decryptedHash.equals(base64ToBuffer(plaintext_hash))) {
      throw new Error('Decrypted media hash mismatch');
    }

    console.log('File successfully decrypted!');
    return decryptedMedia;
  } catch (error) {
    console.error('Error while decrypting the file:', error);
    throw error;
  }
};
