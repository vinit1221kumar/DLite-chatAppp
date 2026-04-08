import cron from 'node-cron'
import env from './config/env.js'
import { isWorkerConfigured } from './config/env.js'
import { runBackupJob } from './services/backupService.js'
import { closeMongoConnection } from './services/mongoService.js'
import { logger } from './utils/logger.js'

logger.info('Starting backup worker', {
  cronSchedule: env.cronSchedule,
})

if (!isWorkerConfigured()) {
  logger.warn('Backup worker is not configured; running in disabled mode', {
    missing: env.missingRequired,
  })
  // Keep the process alive so Docker doesn't restart-loop the container.
  setInterval(() => {}, 60 * 60 * 1000)
} else {
  // Run once on startup so the worker begins syncing immediately.
  runBackupJob()

  // Cron runs in the worker process, so it never blocks the main application services.
  cron.schedule(env.cronSchedule, async () => {
    await runBackupJob()
  })
}

const shutdown = async (signal) => {
  logger.info('Shutting down backup worker', { signal })
  await closeMongoConnection()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
