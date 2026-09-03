import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { connectToDatabase, disconnectFromDatabase } from '@siteops/database';

import { env } from './config/env';
import { createLogger } from './common/logging/logger';

const logger = createLogger('database');

/**
 * Owns the process-wide MongoDB connection.
 *
 * Connecting during module initialization means the process fails to start when
 * the database is unreachable, rather than accepting traffic and failing every
 * request.
 */
@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  static async connect(): Promise<void> {
    await connectToDatabase({
      uri: env.MONGODB_URI,
      maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
      autoIndex: env.MONGODB_AUTO_INDEX,
      appName: 'siteops-api',
    });
    logger.info('database.connected');
  }

  async onApplicationShutdown(): Promise<void> {
    await disconnectFromDatabase();
    logger.info('database.disconnected');
  }
}
