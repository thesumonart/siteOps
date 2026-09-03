import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { UserDto } from '@siteops/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import { Public } from '../common/decorators/public.decorator.js';
import { RateLimit } from '../common/rate-limit/index.js';
import { type Auth } from './auth.instance.js';
import { AUTH_INSTANCE } from './auth.types.js';

/**
 * Session introspection for the browser.
 *
 * Sign-in, sign-up, verification and password reset are served by Better Auth's
 * own handler, mounted as middleware in `main.ts` — it needs the unparsed
 * request body, which a Nest controller would already have consumed.
 */
@Controller()
export class AuthController {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  /**
   * Returns the signed-in user, or null.
   *
   * Public and null-returning by design: the browser needs to distinguish
   * "signed out" from "request failed", and a 401 here would make every
   * first paint look like an error. `emailVerified` is included so the UI can
   * route an unverified account to the confirmation screen rather than the
   * dashboard.
   */
  @Public()
  @RateLimit({ limit: 60, windowSeconds: 60, scope: 'session-read' })
  @Get('session')
  async currentSession(@Req() request: Request): Promise<{ user: UserDto | null }> {
    const result = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!result) return { user: null };

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        image: result.user.image ?? null,
        createdAt: result.user.createdAt.toISOString(),
      },
    };
  }
}
