import { pino, type Logger } from 'pino';

import { env, isProduction, isTest } from '../../config/env';

/**
 * Structured application logger.
 *
 * Production emits newline-delimited JSON for log aggregation; development uses
 * a readable single-line format. Redaction is defined here rather than at call
 * sites so a secret cannot be logged by an author who forgets.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'currentPassword',
  '*.password',
  'token',
  'sessionToken',
  '*.token',
  'secret',
  'apiKey',
  'MONGODB_URI',
  'AUTH_SECRET',
  'RESEND_API_KEY',
];

export const logger: Logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  name: 'siteops-api',
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  formatters: {
    level: (label) => ({ level: label }),
  },
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

/** Child logger tagged with a subsystem name, e.g. `logger.child({ module })`. */
export function createLogger(module: string): Logger {
  return logger.child({ module });
}
