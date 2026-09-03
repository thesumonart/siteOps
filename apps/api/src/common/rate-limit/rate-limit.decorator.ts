import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'siteops:rateLimit';

export interface RateLimitOptions {
  readonly limit: number;
  readonly windowSeconds: number;
  /**
   * Groups several handlers under one budget. Sign-in and sign-up share a
   * scope, for example, so an attacker cannot get two budgets by alternating
   * between them.
   */
  readonly scope?: string;
}

/** Overrides the default rate limit for a route or controller. */
export const RateLimit = (options: RateLimitOptions): CustomDecorator<string> =>
  SetMetadata(RATE_LIMIT_KEY, options);
