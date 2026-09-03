import { envSchema, type Env } from './env.schema';

/**
 * The loaded, validated configuration for this process.
 *
 * Parsing happens once at import time so a misconfigured API fails at startup
 * rather than on the first request. The schema itself lives in `env.schema.ts`
 * and has no side effects, which is what makes it testable.
 */

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
