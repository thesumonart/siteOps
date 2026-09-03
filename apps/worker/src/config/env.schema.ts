import { z } from 'zod';

/**
 * Validated worker configuration.
 *
 * Every monitoring parameter is configurable here rather than hard-coded at the
 * point of use, so tuning the checker never means hunting for magic numbers.
 */

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** Health/readiness probe port. Platforms need an HTTP endpoint to keep a worker alive. */
    WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(4001),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required.'),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(5),
    MONGODB_AUTO_INDEX: booleanFromEnv.default(false),

    APP_URL: z.url(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default('SiteOps <onboarding@resend.dev>'),

    /** How often the scheduler looks for websites that are due. */
    MONITOR_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(300).default(15),
    /** Websites checked simultaneously. Bounds outbound sockets and memory. */
    MONITOR_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(10),
    MONITOR_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    MONITOR_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(5),
    MONITOR_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(10).default(3),
    MONITOR_RECOVERY_THRESHOLD: z.coerce.number().int().min(1).max(10).default(2),
    /** Attempts per scheduled check, including the first. Never retries forever. */
    MONITOR_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),

    /**
     * Disables SSRF address filtering so the test suite can reach a mock server
     * on loopback. Enabling it in production would turn the worker into an open
     * proxy into the private network, so it is refused there outright.
     */
    MONITOR_ALLOW_PRIVATE_ADDRESSES: booleanFromEnv.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.MONITOR_ALLOW_PRIVATE_ADDRESSES) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONITOR_ALLOW_PRIVATE_ADDRESSES'],
        message:
          'MONITOR_ALLOW_PRIVATE_ADDRESSES must never be enabled in production: it disables SSRF protection.',
      });
    }
    if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required in production so outage alerts can be delivered.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
