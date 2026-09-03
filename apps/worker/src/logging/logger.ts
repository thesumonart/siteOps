import { pino, type Logger } from 'pino';

import { env, isProduction, isTest } from '../config/env.js';

/**
 * Structured worker logger.
 *
 * The worker's log stream is the primary operational record of what monitoring
 * did and why, so events use stable dotted names (`website.check.completed`)
 * that can be filtered and counted by a log aggregator.
 */
const REDACTED_PATHS = ['MONGODB_URI', 'RESEND_API_KEY', 'AUTH_SECRET', 'token', '*.token'];

export const logger: Logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  name: 'siteops-worker',
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export function createLogger(module: string): Logger {
  return logger.child({ module });
}
