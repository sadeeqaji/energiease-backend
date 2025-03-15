import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: 'your_cloud_name',
  api_key: 'your_api_key',
  api_secret: 'your_api_secret',
});

export async function uploadToCloudinary(
  filePath: string,
): Promise<string | null> {
  try {
    const response = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto',
    });

    console.log('File uploaded to Cloudinary:', response.secure_url);
    return response.secure_url;
  } catch (error) {
    console.error(
      'Error uploading file to Cloudinary:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }
}
