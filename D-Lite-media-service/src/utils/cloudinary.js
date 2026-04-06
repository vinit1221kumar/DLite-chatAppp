import { v2 as cloudinary } from 'cloudinary'
import { env, isMediaStorageConfigured } from '../config/env.js'

if (isMediaStorageConfigured()) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  })
}

function ensureConfigured() {
  if (!isMediaStorageConfigured()) {
    const error = new Error(
      `Media storage is not configured (missing: ${(env.missingRequired || []).join(', ') || 'CLOUDINARY_*'})`
    )
    error.status = 503
    throw error
  }
}

export const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    try {
      ensureConfigured()
    } catch (e) {
      return reject(e)
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: env.cloudinary.folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          return reject(error)
        }

        return resolve(result)
      }
    )

    uploadStream.end(file.buffer)
  })

export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  ensureConfigured()
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  })

  return result
}
