import 'dotenv/config';
import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';

function configureCloudinary() {
  const config = cloudinary.config(true);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || config.cloud_name;
  const apiKey = process.env.CLOUDINARY_API_KEY || config.api_key;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || config.api_secret;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_URL or the CLOUDINARY_* credentials.'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export async function uploadCloudinaryAsset(data, options) {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: options.resourceType,
        ...(options.format ? { format: options.format } : {}),
        overwrite: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error || !result?.public_id || !result.secure_url) {
          reject(
            new Error(
              'Cloudinary upload failed. Check the server configuration and try again.'
            )
          );
          return;
        }

        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          resourceType: options.resourceType,
        });
      }
    );

    uploadStream.on('error', () => {
      reject(
        new Error(
          'Cloudinary upload failed. Check the server configuration and try again.'
        )
      );
    });

    Readable.from([data]).pipe(uploadStream);
  });
}

export async function deleteCloudinaryAsset(asset) {
  configureCloudinary();

  try {
    const result = await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      type: 'upload',
      invalidate: true,
    });

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error('Cloudinary rejected the asset deletion.');
    }
  } catch {
    throw new Error(
      'Cloudinary asset deletion failed. The database record was not removed.'
    );
  }
}

export function getCloudinaryDownloadUrl(asset, format) {
  configureCloudinary();

  return cloudinary.utils.private_download_url(
    asset.publicId,
    format,
    {
      resource_type: asset.resourceType,
      type: 'upload',
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
    }
  );
}