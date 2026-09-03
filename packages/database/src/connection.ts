import mongoose, { type Connection, type Mongoose } from 'mongoose';
import { type Db } from 'mongodb';

/**
 * Single Mongoose connection shared by the API, the worker and the auth layer.
 *
 * Better Auth needs a raw `Db` handle rather than a Mongoose connection, so it
 * is given the driver handle underneath this connection instead of opening a
 * second pool. One pool keeps us inside the MongoDB Atlas free-tier connection
 * limit, which is the tightest constraint in the initial deployment.
 */

export interface DatabaseConnectionOptions {
  readonly uri: string;
  /**
   * Upper bound on pooled sockets. The worker and the API each hold their own
   * pool, so the sum must stay under the cluster limit.
   */
  readonly maxPoolSize?: number;
  readonly minPoolSize?: number;
  readonly serverSelectionTimeoutMs?: number;
  /**
   * Building indexes automatically is convenient in development and dangerous
   * in production, where an accidental index build can stall a live cluster.
   * Production deployments run `pnpm --filter @siteops/database indexes:sync`.
   */
  readonly autoIndex?: boolean;
  readonly appName?: string;
}

let connectionPromise: Promise<Mongoose> | null = null;

mongoose.set('strictQuery', true);
// Surfaces a clear error instead of buffering a query forever when the driver
// is not connected — a silent hang is the worst failure mode for a worker.
mongoose.set('bufferCommands', false);

export async function connectToDatabase(options: DatabaseConnectionOptions): Promise<Mongoose> {
  connectionPromise ??= mongoose.connect(options.uri, {
    maxPoolSize: options.maxPoolSize ?? 10,
    minPoolSize: options.minPoolSize ?? 0,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMs ?? 10_000,
    autoIndex: options.autoIndex ?? false,
    appName: options.appName ?? 'siteops',
    retryWrites: true,
  });

  try {
    return await connectionPromise;
  } catch (error) {
    // Reset so a later attempt can retry rather than await a rejected promise.
    connectionPromise = null;
    throw error;
  }
}

export function getConnection(): Connection {
  return mongoose.connection;
}

/** Raw driver handle, used by Better Auth's MongoDB adapter. */
export function getMongoDb(): Db {
  const { db } = mongoose.connection;
  if (!db) {
    throw new Error('Database is not connected. Call connectToDatabase() during startup.');
  }
  return db;
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectFromDatabase(): Promise<void> {
  connectionPromise = null;
  await mongoose.disconnect();
}

/**
 * Liveness probe for `/ready`. Uses `ping` rather than `readyState` so it
 * reports the state of the actual server round-trip, not just the local socket.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getMongoDb().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export { mongoose };
