import 'dotenv/config'

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MONGODB_URI']

const looksLikePlaceholder = (value) => {
  if (!value) return true
  const v = String(value).trim()
  if (!v) return true
  return (
    v.includes('your-project-id') ||
    v.includes('your-supabase-anon-key') ||
    v.includes('your-supabase-service-role-key') ||
    v.includes('replace-with-strong-secret') ||
    v === 'changeme' ||
    v === 'example'
  )
}

const missing = required.filter((key) => looksLikePlaceholder(process.env[key]))

export const isWorkerConfigured = () => missing.length === 0

export const env = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME || 'd_lite_backup',
  mongoCollectionName: process.env.MONGODB_COLLECTION_NAME || 'message_backups',
  cronSchedule: process.env.BACKUP_CRON_SCHEDULE || '*/5 * * * *',
  batchSize: Number.parseInt(process.env.BACKUP_BATCH_SIZE || '500', 10),
  missingRequired: missing,
}

export default env
