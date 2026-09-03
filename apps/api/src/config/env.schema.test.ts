import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema';

const baseEnv = {
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:4000',
  MONGODB_URI: 'mongodb://localhost:27017/siteops',
  AUTH_SECRET: 'a'.repeat(32),
};

function issuePaths(input: Record<string, string>): string[] {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('API environment validation', () => {
  it('applies documented defaults', () => {
    const result = envSchema.parse(baseEnv);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(4000);
    expect(result.RATE_LIMIT_MAX_REQUESTS).toBe(120);
    expect(result.AUTH_RATE_LIMIT_MAX_REQUESTS).toBe(10);
    expect(result.TRUST_PROXY).toBe(false);
    // Index builds must be an explicit deployment step, never a startup side effect.
    expect(result.MONGODB_AUTO_INDEX).toBe(false);
  });

  it('requires a signing secret long enough to resist offline attack', () => {
    expect(issuePaths({ ...baseEnv, AUTH_SECRET: 'too-short' })).toContain('AUTH_SECRET');
    expect(issuePaths({ ...baseEnv, AUTH_SECRET: 'b'.repeat(31) })).toContain('AUTH_SECRET');
    expect(issuePaths({ ...baseEnv, AUTH_SECRET: 'b'.repeat(32) })).not.toContain('AUTH_SECRET');
  });

  it('refuses to start without a database URI', () => {
    const { MONGODB_URI: _omitted, ...withoutDatabase } = baseEnv;
    expect(issuePaths(withoutDatabase)).toContain('MONGODB_URI');
  });

  /** Session cookies are Secure-only, so an http APP_URL would break sign-in entirely. */
  it('refuses a plaintext APP_URL in production', () => {
    const paths = issuePaths({
      ...baseEnv,
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_test',
    });

    expect(paths).toContain('APP_URL');
  });

  it('accepts an https APP_URL in production', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'production',
      APP_URL: 'https://app.siteops.test',
      RESEND_API_KEY: 're_test',
    });

    expect(result.success).toBe(true);
  });

  it('requires an email provider in production', () => {
    expect(
      issuePaths({ ...baseEnv, NODE_ENV: 'production', APP_URL: 'https://app.siteops.test' }),
    ).toContain('RESEND_API_KEY');
  });

  it('parses additional trusted origins from a comma-separated list', () => {
    const result = envSchema.parse({
      ...baseEnv,
      ADDITIONAL_TRUSTED_ORIGINS: 'https://staging.siteops.test, https://preview.siteops.test',
    });

    expect(result.ADDITIONAL_TRUSTED_ORIGINS).toEqual([
      'https://staging.siteops.test',
      'https://preview.siteops.test',
    ]);
  });

  it('rejects a trusted origin that is not a URL, which would silently break CORS', () => {
    expect(issuePaths({ ...baseEnv, ADDITIONAL_TRUSTED_ORIGINS: 'not-a-url' })).toContain(
      'ADDITIONAL_TRUSTED_ORIGINS.0',
    );
  });

  it('rejects an out-of-range port', () => {
    expect(issuePaths({ ...baseEnv, PORT: '0' })).toContain('PORT');
    expect(issuePaths({ ...baseEnv, PORT: '70000' })).toContain('PORT');
  });
});
