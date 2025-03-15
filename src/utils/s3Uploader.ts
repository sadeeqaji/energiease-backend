import { env } from '@/config';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a file to AWS S3.
 * @param {Buffer|Uint8Array|Blob|string} file - The file content.
 * @param {string} fileName - The name of the file.
 * @param {string} bucketName - The S3 bucket name.
 * @param {string} contentType - The MIME type of the file.
 * @returns {Promise<string>} - The uploaded file URL.
 */
interface UploadFileParams {
  file: Buffer | Uint8Array | Blob | string;
  fileName: string;
  bucketName: string;
  contentType: string;
  folder?: string;
}

const generateUniqueKey = (fileName: string): string => {
  const uniqueId = uuidv4();
  const extension = fileName.split('.').pop();
  return `${uniqueId}.${extension}`;
};

export const uploadFileToS3 = async ({
  file,
  fileName,
  bucketName,
  contentType,
  folder,
}: UploadFileParams): Promise<string> => {
  try {
    const uniqueFileName = generateUniqueKey(fileName);
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    let fileBuffer: Buffer;

    if (file instanceof ArrayBuffer) {
      fileBuffer = Buffer.from(file);
    } else if (file instanceof Blob) {
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      fileBuffer = file as Buffer;
    }

    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ServerSideEncryption: ServerSideEncryption.AES256,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://${bucketName}.s3.amazonaws.com/${key}`;
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error('Failed to upload file to S3');
  }
};

export const deleteFilesInFolder = async (
  bucketName: string,
  folder: string,
) => {
  try {
    const listParams = {
      Bucket: bucketName,
      Prefix: folder,
    };

    const listResponse = await s3Client.send(
      new ListObjectsV2Command(listParams),
    );
    const objects = listResponse.Contents || [];

    // Delete each object
    for (const object of objects) {
      const deleteParams = {
        Bucket: bucketName,
        Key: object.Key!,
      };
      await s3Client.send(new DeleteObjectCommand(deleteParams));
    }
  } catch (error) {
    console.log('Error deleting files:', error);
    throw error;
  }
};
