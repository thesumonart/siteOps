import { HttpStatus } from '@nestjs/common';
import type { OrganizationRole } from '@siteops/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../common/errors/api-exception.js';
import { MemberService } from './member.service.js';
import type { MemberRepository, MemberWithUser } from './member.repository.js';
import type { OrganizationService } from './organization.service.js';
import type { OrganizationContext } from './organization.types.js';

/**
 * The rules under test are the ones that keep an organization governable:
 * nobody may grant themselves more power than they hold, and the last owner can
 * never be demoted or removed.
 */

const ORG_ID = '507f1f77bcf86cd799439011';
const OWNER_USER = '507f1f77bcf86cd799439021';
const ADMIN_USER = '507f1f77bcf86cd799439022';
const MEMBER_USER = '507f1f77bcf86cd799439023';

const organization = {
  id: ORG_ID,
  objectId: { toHexString: () => ORG_ID },
  name: 'Acme',
  slug: 'acme',
  plan: 'free',
  role: 'owner',
  permissions: [],
} as unknown as OrganizationContext;

function memberOf(
  userId: string,
  role: OrganizationRole,
  memberId = `m-${userId}`,
): MemberWithUser {
  return {
    memberId,
    userId,
    name: role,
    email: `${role}@example.test`,
    role,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildService(options: {
  readonly target?: MemberWithUser | null;
  readonly ownerCount?: number;
}) {
  const repository = {
    findMemberById: vi.fn().mockResolvedValue(options.target ?? null),
    countOwners: vi.fn().mockResolvedValue(options.ownerCount ?? 2),
    updateRole: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    findUserIdByEmail: vi.fn().mockResolvedValue(null),
    isMember: vi.fn().mockResolvedValue(false),
    upsertInvitation: vi.fn(),
  } as unknown as MemberRepository;

  const organizations = {
    assertCanAddMember: vi.fn().mockResolvedValue(undefined),
  } as unknown as OrganizationService;

  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const email = { send: vi.fn().mockResolvedValue({ delivered: true }) };

  const service = new MemberService(repository, organizations, audit, email as never);

  return { service, repository, email };
}

async function rejection(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return error;
    throw error;
  }
  throw new Error('Expected an ApiException.');
}

describe('MemberService — role escalation', () => {
  it('refuses to invite above the inviter’s own role', async () => {
    const { service, email } = buildService({});

    const error = await rejection(
      service.invite(
        organization,
        { email: 'x@example.test', role: 'owner' },
        {
          id: ADMIN_USER,
          name: 'Admin',
          role: 'admin',
        },
      ),
    );

    expect(error.code).toBe('INSUFFICIENT_ROLE');
    // Nothing was emailed for a refused invitation.
    expect(email.send).not.toHaveBeenCalled();
  });

  it('lets an owner invite an admin', async () => {
    const { service, repository, email } = buildService({});
    vi.mocked(repository.upsertInvitation).mockResolvedValue({
      id: 'inv-1',
      organizationId: organization.objectId,
      email: 'new@example.test',
      role: 'admin',
      invitedByName: 'Owner',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const invitation = await service.invite(
      organization,
      { email: 'new@example.test', role: 'admin' },
      { id: OWNER_USER, name: 'Owner', role: 'owner' },
    );

    expect(invitation.role).toBe('admin');
    expect(email.send).toHaveBeenCalledOnce();
  });

  it('refuses to change the role of a superior', async () => {
    const { service } = buildService({ target: memberOf(OWNER_USER, 'owner') });

    const error = await rejection(
      service.updateRole(organization, 'm-owner', 'member', {
        id: ADMIN_USER,
        name: 'Admin',
        role: 'admin',
      }),
    );

    expect(error.code).toBe('INSUFFICIENT_ROLE');
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('refuses to grant a role above the actor’s own', async () => {
    const { service } = buildService({ target: memberOf(MEMBER_USER, 'member') });

    const error = await rejection(
      service.updateRole(organization, 'm-member', 'owner', {
        id: ADMIN_USER,
        name: 'Admin',
        role: 'admin',
      }),
    );

    expect(error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('lets an owner promote another member to owner', async () => {
    const { service, repository } = buildService({ target: memberOf(MEMBER_USER, 'member') });

    const updated = await service.updateRole(organization, 'm-member', 'owner', {
      id: OWNER_USER,
      name: 'Owner',
      role: 'owner',
    });

    expect(updated.role).toBe('owner');
    expect(repository.updateRole).toHaveBeenCalledWith(organization.objectId, 'm-member', 'owner');
  });

  it('refuses self role changes, so an admin cannot promote themselves', async () => {
    const { service } = buildService({ target: memberOf(ADMIN_USER, 'admin') });

    const error = await rejection(
      service.updateRole(organization, 'm-admin', 'owner', {
        id: ADMIN_USER,
        name: 'Admin',
        role: 'admin',
      }),
    );

    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('lets an owner promote a member to admin', async () => {
    const { service, repository } = buildService({ target: memberOf(MEMBER_USER, 'member') });

    const updated = await service.updateRole(organization, 'm-member', 'admin', {
      id: OWNER_USER,
      name: 'Owner',
      role: 'owner',
    });

    expect(updated.role).toBe('admin');
    expect(repository.updateRole).toHaveBeenCalledWith(organization.objectId, 'm-member', 'admin');
  });
});

describe('MemberService — last owner protection', () => {
  it('refuses to demote the only owner', async () => {
    const { service } = buildService({
      target: memberOf(ADMIN_USER, 'owner'),
      ownerCount: 1,
    });

    const error = await rejection(
      service.updateRole(organization, 'm-owner', 'admin', {
        id: OWNER_USER,
        name: 'Owner',
        role: 'owner',
      }),
    );

    expect(error.code).toBe('CANNOT_REMOVE_LAST_OWNER');
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('refuses to remove the only owner, including themselves', async () => {
    const { service } = buildService({
      target: memberOf(OWNER_USER, 'owner'),
      ownerCount: 1,
    });

    const error = await rejection(
      service.remove(organization, 'm-owner', { id: OWNER_USER, name: 'Owner', role: 'owner' }),
    );

    expect(error.code).toBe('CANNOT_REMOVE_LAST_OWNER');
  });

  it('allows demoting an owner once a second one exists', async () => {
    const { service, repository } = buildService({
      target: memberOf(ADMIN_USER, 'owner'),
      ownerCount: 2,
    });

    await service.updateRole(organization, 'm-owner', 'admin', {
      id: OWNER_USER,
      name: 'Owner',
      role: 'owner',
    });

    expect(repository.updateRole).toHaveBeenCalled();
  });

  it('lets a non-owner member leave without touching the owner count', async () => {
    const { service, repository } = buildService({
      target: memberOf(MEMBER_USER, 'member'),
      ownerCount: 1,
    });

    await service.remove(organization, 'm-member', {
      id: MEMBER_USER,
      name: 'Member',
      role: 'member',
    });

    expect(repository.remove).toHaveBeenCalledWith(organization.objectId, 'm-member');
  });

  it('refuses to remove someone who outranks the actor', async () => {
    const { service } = buildService({ target: memberOf(OWNER_USER, 'owner'), ownerCount: 2 });

    const error = await rejection(
      service.remove(organization, 'm-owner', {
        id: MEMBER_USER,
        name: 'Member',
        role: 'member',
      }),
    );

    expect(error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('reports a member from another organization as not found', async () => {
    // The repository scopes by organizationId, so a foreign member id simply
    // does not resolve — the caller learns nothing about it.
    const { service } = buildService({ target: null });

    const error = await rejection(
      service.remove(organization, 'm-elsewhere', {
        id: OWNER_USER,
        name: 'Owner',
        role: 'owner',
      }),
    );

    expect(error.code).toBe('MEMBER_NOT_FOUND');
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
});
