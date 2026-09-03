import {
  SetMetadata,
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission } from '@siteops/shared';
import type { Request } from 'express';

import { ApiException } from '../common/errors/api-exception.js';
import { type OrganizationContext } from './organization.types.js';

export const REQUIRED_PERMISSIONS_KEY = 'siteops:requiredPermissions';

/**
 * Declares which permissions a route needs inside the active organization.
 *
 * Presence of this decorator is also what tells {@link OrganizationGuard} to
 * resolve an organization at all, so a route either states its requirement or
 * never sees an organization context.
 *
 * Always name permissions, never roles: a capability change then happens in
 * `@siteops/shared` rather than across every controller.
 */
export const RequirePermission = (...permissions: readonly Permission[]): CustomDecorator<string> =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/** Injects the verified organization context. Present only on guarded routes. */
export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationContext => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.organization) {
      // Reaching this means a handler asked for an organization without
      // declaring a permission — a wiring bug, not a client error.
      throw ApiException.forbidden();
    }
    return request.organization;
  },
);
