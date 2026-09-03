import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema.js';

const baseEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/siteops',
  APP_URL: 'https://app.siteops.test',
};

function issuePaths(input: Record<string, string>): string[] {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('worker environment validation', () => {
  it('applies documented defaults', () => {
    const result = envSchema.parse(baseEnv);

    expect(result.NODE_ENV).toBe('development');
    expect(result.MONITOR_POLL_INTERVAL_SECONDS).toBe(15);
    expect(result.MONITOR_CONCURRENCY).toBe(10);
    expect(result.MONITOR_FAILURE_THRESHOLD).toBe(3);
    expect(result.MONITOR_RECOVERY_THRESHOLD).toBe(2);
    expect(result.MONITOR_ALLOW_PRIVATE_ADDRESSES).toBe(false);
  });

  it('refuses to start without a database URI', () => {
    expect(issuePaths({ APP_URL: baseEnv.APP_URL })).toContain('MONGODB_URI');
  });

  it('refuses a malformed APP_URL rather than building broken email links', () => {
    expect(issuePaths({ ...baseEnv, APP_URL: 'not-a-url' })).toContain('APP_URL');
  });

  /**
   * The single most dangerous misconfiguration in the product: with SSRF
   * filtering off, any user could point a monitor at internal infrastructure.
   */
  it('refuses to disable SSRF protection in production', () => {
    const paths = issuePaths({
      ...baseEnv,
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_test',
      MONITOR_ALLOW_PRIVATE_ADDRESSES: 'true',
    });

    expect(paths).toContain('MONITOR_ALLOW_PRIVATE_ADDRESSES');
  });

  it('allows SSRF filtering to be disabled outside production, for test fixtures', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'test',
      MONITOR_ALLOW_PRIVATE_ADDRESSES: 'true',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.MONITOR_ALLOW_PRIVATE_ADDRESSES).toBe(true);
  });

  it('requires an email provider in production so outage alerts are deliverable', () => {
    expect(issuePaths({ ...baseEnv, NODE_ENV: 'production' })).toContain('RESEND_API_KEY');
  });

  it('rejects monitoring values outside their safe bounds', () => {
    expect(issuePaths({ ...baseEnv, MONITOR_CONCURRENCY: '0' })).toContain('MONITOR_CONCURRENCY');
    expect(issuePaths({ ...baseEnv, MONITOR_CONCURRENCY: '5000' })).toContain(
      'MONITOR_CONCURRENCY',
    );
    expect(issuePaths({ ...baseEnv, MONITOR_REQUEST_TIMEOUT_MS: '100' })).toContain(
      'MONITOR_REQUEST_TIMEOUT_MS',
    );
    expect(issuePaths({ ...baseEnv, MONITOR_MAX_ATTEMPTS: '99' })).toContain(
      'MONITOR_MAX_ATTEMPTS',
    );
  });

  it('coerces numeric strings, since every environment variable arrives as text', () => {
    const result = envSchema.parse({ ...baseEnv, MONITOR_CONCURRENCY: '25' });
    expect(result.MONITOR_CONCURRENCY).toBe(25);
  });
});
