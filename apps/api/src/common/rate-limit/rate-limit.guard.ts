import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { env } from '../../config/env.js';
import { ApiException } from '../errors/api-exception.js';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator.js';
import { RateLimiter, type RateLimitRule } from './rate-limiter.js';

/**
 * Applies the default rate limit to every route, and a stricter one to routes
 * annotated with `@RateLimit(...)`.
 *
 * Requests are keyed by client address *and* route, so hammering the login form
 * cannot exhaust an attacker's budget for reading the dashboard, and one
 * abusive client cannot lock everyone else out of an endpoint.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = new RateLimiter();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const rule: RateLimitRule = options
      ? { windowMs: options.windowSeconds * 1000, limit: options.limit }
      : {
          windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000,
          limit: env.RATE_LIMIT_MAX_REQUESTS,
        };

    const scope = options?.scope ?? `${request.method}:${context.getHandler().name}`;
    const verdict = this.limiter.consume(`${scope}|${this.clientKey(request)}`, rule);

    response.setHeader('RateLimit-Limit', verdict.limit);
    response.setHeader('RateLimit-Remaining', verdict.remaining);
    response.setHeader('RateLimit-Reset', Math.ceil((verdict.resetAt - Date.now()) / 1000));

    if (!verdict.allowed) {
      response.setHeader('Retry-After', verdict.retryAfterSeconds);
      throw ApiException.rateLimited();
    }

    return true;
  }

  /**
   * Express only reports the forwarded client address when `trust proxy` is
   * enabled, which the configuration ties to actually running behind one. That
   * keeps a client from spoofing its identity with an X-Forwarded-For header.
   */
  private clientKey(request: Request): string {
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
