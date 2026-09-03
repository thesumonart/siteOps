import { connectToDatabase, disconnectFromDatabase } from '@siteops/database';
import type { Server } from 'node:http';

import { env } from './config/env.js';
import { startHealthServer } from './health/server.js';
import { createLogger, logger } from './logging/logger.js';

const log = createLogger('bootstrap');

/**
 * Monitoring worker entry point.
 *
 * Owns process lifecycle only: configuration, the database connection, the
 * health surface and an orderly shutdown. The monitoring scheduler is started
 * from here once it exists, so that stopping the process always drains work in
 * progress rather than killing a check mid-flight.
 */

/**
 * How long a graceful shutdown may take before the process is killed outright.
 * Slightly under the 30s most platforms allow between SIGTERM and SIGKILL, so
 * the watchdog — not the platform — is what ends a stuck shutdown, and the
 * reason is recorded in our logs.
 */
const SHUTDOWN_WATCHDOG_MS = 25_000;

interface RuntimeState {
  shuttingDown: boolean;
  lastTickAt: number | null;
  healthServer: Server | null;
}

const state: RuntimeState = {
  shuttingDown: false,
  lastTickAt: null,
  healthServer: null,
};

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (state.shuttingDown) return;
  state.shuttingDown = true;
  log.info({ signal }, 'worker.shutdown_started');

  /*
   * Nothing below calls process.exit(). Once the health server is closed and
   * the database pool is drained, no handles remain and Node exits on its own
   * with the code set here — which guarantees pending writes finish first.
   */
  process.exitCode = exitCode;

  const watchdog = setTimeout(() => {
    log.error({ signal }, 'worker.shutdown_timed_out');
    // The one place an abrupt exit is correct: a handle has failed to release
    // and waiting longer would let the platform SIGKILL us with no log line.
    // eslint-disable-next-line n/no-process-exit -- forced exit is the purpose of this watchdog
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, SHUTDOWN_WATCHDOG_MS);
  // Never let the watchdog itself keep the process alive.
  watchdog.unref();

  try {
    if (state.healthServer) {
      await new Promise<void>((resolve) => {
        state.healthServer?.close(() => {
          resolve();
        });
      });
    }
    await disconnectFromDatabase();
    log.info('worker.shutdown_complete');
  } catch (error) {
    log.error({ err: error }, 'worker.shutdown_failed');
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
  }
}

async function bootstrap(): Promise<void> {
  await connectToDatabase({
    uri: env.MONGODB_URI,
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    autoIndex: env.MONGODB_AUTO_INDEX,
    appName: 'siteops-worker',
  });
  log.info('database.connected');

  state.healthServer = startHealthServer(env.WORKER_PORT, {
    accepting: () => !state.shuttingDown,
    lastTickAt: () => state.lastTickAt,
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(signal, 0);
    });
  }

  // An unhandled rejection leaves the process in an unknown state. Shut down so
  // the platform restarts a clean one, rather than continuing to run a worker
  // that may be silently skipping checks.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'worker.unhandled_rejection');
    void shutdown('unhandledRejection', 1);
  });

  log.info(
    {
      environment: env.NODE_ENV,
      pollIntervalSeconds: env.MONITOR_POLL_INTERVAL_SECONDS,
      concurrency: env.MONITOR_CONCURRENCY,
    },
    'worker.started',
  );
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'worker.bootstrap_failed');
  process.exitCode = 1;
});
