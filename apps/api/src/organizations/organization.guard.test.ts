import { HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Permission } from '@siteops/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../common/errors/api-exception.js';
import { OrganizationGuard } from './organization.guard.js';
import type { MembershipRecord, OrganizationRepository } from './organization.repository.js';

/**
 * Tenant isolation is the guarantee under test here, not plumbing.
 *
 * Two properties must hold no matter how the request is shaped:
 *   1. The organization id from the client is never trusted on its own.
 *   2. Another tenant's organization is indistinguishable from one that does
 *      not exist — both are 404, so ids cannot be enumerated.
 */

const ORG_A = '507f1f77bcf86cd799439011';
const ORG_B = '507f1f77bcf86cd799439022';
const USER = '507f1f77bcf86cd799439033';

interface Scenario {
  readonly required?: readonly Permission[];
  readonly membership?: MembershipRecord | null;
  readonly headers?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly authenticated?: boolean;
}

function objectIdOf(hex: string): { toHexString: () => string } {
  return { toHexString: () => hex };
}

function buildGuard(scenario: Scenario) {
  const reflector = {
    getAllAndOverride: () => scenario.required,
  } as unknown as Reflector;

  const findMembership = vi.fn().mockResolvedValue(scenario.membership ?? null);
  const findById = vi.fn().mockImplementation((id: string) =>
    Promise.resolve({
      _id: objectIdOf(id),
      slug: 'acme',
      plan: 'free',
      name: 'Acme',
      timezone: 'UTC',
    }),
  );

  const repository = { findMembership, findById } as unknown as OrganizationRepository;
  const guard = new OrganizationGuard(reflector, repository);

  const headers = scenario.headers ?? {};
  const request = {
    params: scenario.params ?? {},
    headers,
    header: (name: string) => headers[name.toLowerCase()],
    auth:
      scenario.authenticated === false
        ? undefined
        : { user: { id: USER, email: 'a@b.test', name: 'A', emailVerified: true } },
    organization: undefined as unknown,
  };

  const context = {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;

  return { guard, context, request, findMembership };
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return error;
    throw error;
  }
  throw new Error('Expected an ApiException to be thrown.');
}

describe('OrganizationGuard', () => {
  it('lets routes without a declared permission through untouched', async () => {
    const { guard, context, request, findMembership } = buildGuard({ required: undefined });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.organization).toBeUndefined();
    // No membership lookup means no database round trip for public reads.
    expect(findMembership).not.toHaveBeenCalled();
  });

  it('resolves membership from the session, not from the supplied id', async () => {
    const { guard, context, request, findMembership } = buildGuard({
      required: ['website:read'],
      headers: { 'x-organization-id': ORG_A },
      membership: {
        organizationId: objectIdOf(ORG_A) as never,
        userId: objectIdOf(USER) as never,
        role: 'admin',
        joinedAt: new Date(),
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findMembership).toHaveBeenCalledWith(ORG_A, USER);
    expect(request.organization).toMatchObject({ id: ORG_A, role: 'admin' });
  });

  it('returns 404, not 403, for an organization the caller is not a member of', async () => {
    const { guard, context } = buildGuard({
      required: ['website:read'],
      headers: { 'x-organization-id': ORG_B },
      membership: null,
    });

    const error = await expectApiError(guard.canActivate(context));

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('gives the same answer for a non-existent organization, so ids cannot be probed', async () => {
    const rejectionFor = async (organizationId: string): Promise<ApiException> => {
      const { guard, context } = buildGuard({
        required: ['website:read'],
        headers: { 'x-organization-id': organizationId },
        membership: null,
      });
      return expectApiError(guard.canActivate(context));
    };

    const neverExisted = await rejectionFor('507f1f77bcf86cd7994390ff');
    const belongsToSomeoneElse = await rejectionFor(ORG_B);

    // Any difference here — status, code or wording — would be an oracle
    // telling an attacker which organization ids are real.
    expect(neverExisted.getStatus()).toBe(belongsToSomeoneElse.getStatus());
    expect(neverExisted.code).toBe(belongsToSomeoneElse.code);
    expect(neverExisted.message).toBe(belongsToSomeoneElse.message);
  });

  it('refuses a member whose role lacks the permission', async () => {
    const { guard, context } = buildGuard({
      required: ['website:delete'],
      headers: { 'x-organization-id': ORG_A },
      membership: {
        organizationId: objectIdOf(ORG_A) as never,
        userId: objectIdOf(USER) as never,
        role: 'member',
        joinedAt: new Date(),
      },
    });

    const error = await expectApiError(guard.canActivate(context));

    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('allows a role that holds every required permission', async () => {
    const { guard, context } = buildGuard({
      required: ['website:create', 'website:delete'],
      headers: { 'x-organization-id': ORG_A },
      membership: {
        organizationId: objectIdOf(ORG_A) as never,
        userId: objectIdOf(USER) as never,
        role: 'admin',
        joinedAt: new Date(),
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('prefers an explicit path parameter over the header', async () => {
    const { guard, context, findMembership } = buildGuard({
      required: ['website:read'],
      params: { organizationId: ORG_A },
      // A header naming a different organization must not win.
      headers: { 'x-organization-id': ORG_B },
      membership: {
        organizationId: objectIdOf(ORG_A) as never,
        userId: objectIdOf(USER) as never,
        role: 'owner',
        joinedAt: new Date(),
      },
    });

    await guard.canActivate(context);
    expect(findMembership).toHaveBeenCalledWith(ORG_A, USER);
  });

  it('rejects a guarded request that names no organization', async () => {
    const { guard, context } = buildGuard({ required: ['website:read'] });

    const error = await expectApiError(guard.canActivate(context));
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rejects an unauthenticated caller before touching the database', async () => {
    const { guard, context, findMembership } = buildGuard({
      required: ['website:read'],
      headers: { 'x-organization-id': ORG_A },
      authenticated: false,
    });

    const error = await expectApiError(guard.canActivate(context));

    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(findMembership).not.toHaveBeenCalled();
  });
});
