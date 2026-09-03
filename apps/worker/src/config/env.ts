import { envSchema, type Env } from './env.schema.js';

/**
 * The loaded, validated configuration for this process.
 *
 * Parsing happens once at import time so a misconfigured worker fails at
 * startup rather than at the first check. The schema itself lives in
 * `env.schema.ts` and has no side effects, which is what makes it testable.
 */

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Field names and messages only — values are withheld because the offending
    // value is often the secret itself.
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
