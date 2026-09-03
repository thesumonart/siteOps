import { z } from 'zod';

/**
 * Validated process configuration.
 *
 * Configuration is parsed once, at import time, and the process refuses to
 * start when anything required is missing or malformed. Reading `process.env`
 * anywhere else is an ESLint error, so this module is the only place where
 * untyped configuration exists.
 */

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const csvOrigins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(z.url()).min(1));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Public origin of the Next.js app. Used for CORS, cookies and email links. */
    APP_URL: z.url(),
    /** Public origin of this API. Used to build absolute callback URLs. */
    API_URL: z.url(),
    /** Extra browser origins permitted by CORS, comma-separated. */
    ADDITIONAL_TRUSTED_ORIGINS: csvOrigins.optional(),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required.'),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /**
     * Index builds are an explicit deployment step in production; see
     * `pnpm --filter @siteops/database indexes:sync`.
     */
    MONGODB_AUTO_INDEX: booleanFromEnv.default(false),

    /**
     * Signing key for sessions and tokens. 32 bytes of entropy minimum —
     * generate with `openssl rand -base64 32`.
     */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters.'),
    /** Set when the API and the web app are served from different hosts. */
    COOKIE_DOMAIN: z.string().min(1).optional(),

    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default('SiteOps <onboarding@resend.dev>'),

    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(10),

    /** Trust `X-Forwarded-For` only behind a proxy that sets it (Railway, Fly, Render). */
    TRUST_PROXY: booleanFromEnv.default(false),
  })
  .superRefine((env, ctx) => {
    // Without a mail provider, verification links and outage alerts silently go
    // nowhere. That is acceptable locally, never in production.
    if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required in production so emails can be delivered.',
      });
    }
    if (env.NODE_ENV === 'production' && env.APP_URL.startsWith('http://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'APP_URL must use https in production; session cookies are Secure-only.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Print field names and messages only. Values are withheld because this
    // output reaches logs and the offending value is often the secret itself.
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid API environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Every browser origin allowed to send credentialed requests to this API. */
export const trustedOrigins: readonly string[] = [
  env.APP_URL,
  ...(env.ADDITIONAL_TRUSTED_ORIGINS ?? []),
];
