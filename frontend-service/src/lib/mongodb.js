import { MongoClient } from 'mongodb';

// Prefer server-only env vars; keep NEXT_PUBLIC_* for backward compatibility.
const uri = process.env.MONGODB_URI || process.env.NEXT_PUBLIC_MONGODB_URI;

const dbName = process.env.MONGODB_DB_NAME || process.env.NEXT_PUBLIC_MONGODB_DB_NAME || 'd_lite_backup';

let client;
let clientPromise;
let indexesPromise;

if (uri) {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
}

export function isMongoBackupConfigured() {
  return Boolean(uri);
}

export async function getMongoDb() {
  if (!clientPromise) {
    throw new Error('MongoDB backup is not configured.');
  }
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}

export async function ensureMessageBackupIndexes() {
  if (!clientPromise) return;
  if (!indexesPromise) {
    indexesPromise = (async () => {
      const db = await getMongoDb();
      const collection = db.collection('message_backups');

      // Fast upsert by backupKey + common history queries.
      await collection.createIndexes([
        { key: { backupKey: 1 }, unique: true, name: 'uniq_backupKey' },
        { key: { scope: 1, threadId: 1, sourceCreatedAt: -1 }, name: 'direct_history' },
        { key: { scope: 1, groupId: 1, sourceCreatedAt: -1 }, name: 'group_history' },
        { key: { status: 1, backupUpdatedAt: -1 }, name: 'status_updated' },
      ]);
    })().catch((e) => {
      indexesPromise = undefined;
      console.warn('[mongodb] ensureMessageBackupIndexes failed', e?.message || e);
    });
  }
  return indexesPromise;
}
