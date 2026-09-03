import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../common/errors/api-exception.js';
import { type AuthenticatedUser } from './auth.types.js';

/**
 * Injects the authenticated user into a handler parameter.
 *
 * Throws rather than returning undefined when no session is present: reaching
 * this on a route that skipped AuthGuard is a wiring bug, and returning
 * undefined would let it surface later as a confusing tenant-scoping failure.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) {
      throw ApiException.unauthenticated();
    }
    return request.auth.user;
  },
);
