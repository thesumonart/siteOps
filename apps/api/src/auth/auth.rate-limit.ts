import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { RateLimiter, type RateLimitRule } from '../common/rate-limit/rate-limiter.js';

/**
 * Rate limiting for the Better Auth routes.
 *
 * Those routes are mounted as raw middleware — Better Auth needs the unparsed
 * body — so Nest's `RateLimitGuard` never sees them. This applies the same
 * limiter, in the same shape, ahead of the handler.
 *
 * Credential endpoints get their own tight budget: brute force and credential
 * stuffing are the attacks this exists to blunt, and they must not be able to
 * consume the general API allowance either.
 */

const limiter = new RateLimiter();

interface AuthRouteRule {
  /** Matched against the path *after* the auth base path. */
  readonly match: (path: string) => boolean;
  readonly scope: string;
  readonly rule: RateLimitRule;
}

const MINUTE = 60_000;

/**
 * Sign-in and sign-up share one scope on purpose: alternating between them must
 * not double an attacker's budget.
 */
function buildRules(): readonly AuthRouteRule[] {
  const credentialLimit = env.AUTH_RATE_LIMIT_MAX_REQUESTS;

  return [
    {
      match: (path) => path.startsWith('/sign-in') || path.startsWith('/sign-up'),
      scope: 'auth-credentials',
      rule: { windowMs: 15 * MINUTE, limit: credentialLimit },
    },
    {
      // Each of these sends an email, so the limit also protects the sending
      // reputation of the domain, not just the account.
      match: (path) =>
        path.startsWith('/forget-password') ||
        path.startsWith('/request-password-reset') ||
        path.startsWith('/reset-password') ||
        path.startsWith('/send-verification-email'),
      scope: 'auth-email',
      rule: { windowMs: 60 * MINUTE, limit: Math.max(3, Math.floor(credentialLimit / 2)) },
    },
  ];
}

const RULES = buildRules();

const DEFAULT_RULE: RateLimitRule = {
  windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
};

export function authRateLimitMiddleware() {
  return (request: Request, response: Response, next: NextFunction): void => {
    // Reads such as `/get-session` are not credential attempts and only need
    // the general allowance.
    const path = request.path;
    const matched = RULES.find((candidate) => candidate.match(path));

    const scope = matched?.scope ?? 'auth-general';
    const rule = matched?.rule ?? DEFAULT_RULE;

    const client = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const verdict = limiter.consume(`${scope}|${client}`, rule);

    response.setHeader('RateLimit-Limit', verdict.limit);
    response.setHeader('RateLimit-Remaining', verdict.remaining);
    response.setHeader('RateLimit-Reset', Math.ceil((verdict.resetAt - Date.now()) / 1000));

    if (!verdict.allowed) {
      response.setHeader('Retry-After', verdict.retryAfterSeconds);
      response.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' },
      });
      return;
    }

    next();
  };
}

/** Test-only reset so limiter state does not leak between cases. */
export function resetAuthRateLimiter(): void {
  limiter.reset();
}
