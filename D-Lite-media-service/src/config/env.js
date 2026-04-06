import 'dotenv/config'

const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
const missing = required.filter((key) => !process.env[key])

export const isMediaStorageConfigured = () => missing.length === 0

const parseOrigins = (value) => {
  const origins = (value || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return origins.length > 0 ? origins : ['*']
}

export const env = {
  port: Number.parseInt(process.env.PORT || '4004', 10),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  maxFileSizeMb: Number.parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'd-lite/media',
  },
  missingRequired: missing,
}

export default env
