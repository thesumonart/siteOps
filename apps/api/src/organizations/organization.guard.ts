import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasEveryPermission, permissionsFor, type Permission } from '@siteops/shared';
import type { Request } from 'express';

import { ApiException } from '../common/errors/api-exception.js';
import { REQUIRED_PERMISSIONS_KEY } from './organization.decorators.js';
import { OrganizationRepository } from './organization.repository.js';
import { type OrganizationContext } from './organization.types.js';

/** Header the browser uses to name the organization it is currently viewing. */
export const ORGANIZATION_HEADER = 'x-organization-id';

/**
 * Resolves and authorizes the active organization.
 *
 * The organization id supplied by the client — header or path parameter — is
 * treated as a *hint*. Membership is looked up from the authenticated user on
 * every request, and only the role stored server-side decides what is allowed.
 *
 * A resource in an organization the caller does not belong to produces a 404,
 * never a 403. A 403 would confirm the id exists, letting an attacker
 * enumerate other tenants' identifiers.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly organizations: OrganizationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<readonly Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Routes that declare no permission never get an organization context.
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.auth?.user;
    if (!user) throw ApiException.unauthenticated();

    const requestedId = readOrganizationId(request);
    if (!requestedId) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Choose an organization before making this request.',
      );
    }

    const membership = await this.organizations.findMembership(requestedId, user.id);
    if (!membership) {
      // Covers both "no such organization" and "not yours" — deliberately
      // indistinguishable from the outside.
      throw ApiException.notFound('ORGANIZATION_NOT_FOUND', 'Organization not found.');
    }

    const organization = await this.organizations.findById(requestedId);
    if (!organization) {
      throw ApiException.notFound('ORGANIZATION_NOT_FOUND', 'Organization not found.');
    }

    const permissions = permissionsFor(membership.role);
    if (!hasEveryPermission(membership.role, required)) {
      throw ApiException.forbidden(
        'INSUFFICIENT_ROLE',
        'Your role does not allow that in this organization.',
      );
    }

    const organizationContext: OrganizationContext = {
      id: organization._id.toHexString(),
      objectId: organization._id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      role: membership.role,
      permissions,
    };
    request.organization = organizationContext;

    return true;
  }
}

/**
 * A path parameter wins over the header: an explicitly addressed resource is
 * unambiguous, while the header only describes what the UI is showing.
 */
function readOrganizationId(request: Request): string | null {
  // Express types a route parameter as `string | string[]`; a repeated
  // parameter is not a valid id, so only a plain string is accepted.
  const params: Record<string, string | string[] | undefined> = request.params;
  const fromPath = params.organizationId ?? params.id;
  if (typeof fromPath === 'string' && fromPath.length > 0) return fromPath;

  const fromHeader = request.header(ORGANIZATION_HEADER);
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;

  return null;
}
