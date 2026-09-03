import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { ApiException } from '../common/errors/api-exception.js';
import { type Auth } from './auth.instance.js';
import { AUTH_INSTANCE, type RequestAuthContext } from './auth.types.js';

/**
 * Resolves the session on every request and denies access by default.
 *
 * Registered globally, so a new route is private unless its handler is
 * explicitly marked `@Public()`. Forgetting the decorator makes a route
 * unreachable rather than unprotected, which is the safe direction to fail.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<Request>();

    const result = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!result) {
      throw ApiException.unauthenticated();
    }

    // An account that has not proven its address must not reach organization
    // data — outage alerts would otherwise be deliverable to an address the
    // signer-up does not control.
    if (!result.user.emailVerified) {
      throw new ApiException('EMAIL_NOT_VERIFIED', 'Confirm your email address to continue.', 403);
    }

    const auth: RequestAuthContext = {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        emailVerified: result.user.emailVerified,
      },
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt,
      },
    };
    request.auth = auth;

    return true;
  }
}
