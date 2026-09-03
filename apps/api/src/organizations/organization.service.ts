import { Injectable } from '@nestjs/common';
import { toObjectId } from '@siteops/database';
import {
  limitsFor,
  permissionsFor,
  slugifyOrganizationName,
  type CreateOrganizationInput,
  type OrganizationDto,
  type OrganizationMembershipDto,
  type UpdateOrganizationInput,
} from '@siteops/shared';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/errors/api-exception.js';
import { createLogger } from '../common/logging/logger.js';
import {
  OrganizationRepository,
  type MembershipWithOrganization,
  type OrganizationRecord,
} from './organization.repository.js';

const logger = createLogger('organizations');

/** Attempts to find a free slug before giving up and asking the user to choose. */
const MAX_SLUG_ATTEMPTS = 25;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly audit: AuditService,
  ) {}

  async listForUser(userId: string): Promise<readonly OrganizationMembershipDto[]> {
    const memberships = await this.repository.listForUser(userId);
    return memberships.map((entry) => toMembershipDto(entry));
  }

  async create(
    input: CreateOrganizationInput,
    actor: { readonly id: string; readonly name: string },
  ): Promise<OrganizationMembershipDto> {
    const ownerObjectId = toObjectId(actor.id);
    if (!ownerObjectId) throw ApiException.unauthenticated();

    const slug = input.slug
      ? await this.claimExactSlug(input.slug)
      : await this.claimDerivedSlug(input.name);

    const organization = await this.repository.createWithOwner({
      name: input.name,
      slug,
      timezone: 'UTC',
      ownerUserId: ownerObjectId,
    });

    await this.audit.record({
      organizationId: organization._id,
      action: 'organization.created',
      actorUserId: actor.id,
      actorName: actor.name,
      targetType: 'organization',
      targetId: organization._id,
      targetLabel: organization.name,
    });

    logger.info({ organizationId: organization._id.toHexString(), slug }, 'organization.created');

    return {
      organization: toOrganizationDto(organization, 0),
      role: 'owner',
      permissions: permissionsFor('owner'),
      joinedAt: new Date().toISOString(),
    };
  }

  async update(
    organizationId: string,
    input: UpdateOrganizationInput,
    actor: { readonly id: string; readonly name: string },
  ): Promise<OrganizationDto> {
    const changes: { name?: string; timezone?: string } = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.timezone !== undefined) changes.timezone = input.timezone;

    const updated = await this.repository.update(organizationId, changes);
    if (!updated) {
      throw ApiException.notFound('ORGANIZATION_NOT_FOUND', 'Organization not found.');
    }

    await this.audit.record({
      organizationId: updated._id,
      action: 'organization.updated',
      actorUserId: actor.id,
      actorName: actor.name,
      targetType: 'organization',
      targetId: updated._id,
      targetLabel: updated.name,
    });

    const websiteCount = await this.repository.countWebsites(updated._id);
    return toOrganizationDto(updated, websiteCount);
  }

  /**
   * Enforces the plan's member cap.
   *
   * Called before an invitation is created. Limits live on the server and are
   * read from the organization's stored plan — never from anything the client
   * sends.
   */
  async assertCanAddMember(organizationId: string): Promise<void> {
    const organization = await this.repository.findById(organizationId);
    if (!organization) {
      throw ApiException.notFound('ORGANIZATION_NOT_FOUND', 'Organization not found.');
    }

    const limits = limitsFor(organization.plan);
    const memberCount = await this.repository.countMembers(organization._id);

    if (memberCount >= limits.maxMembers) {
      throw ApiException.planLimit(
        `The ${organization.plan} plan allows ${limits.maxMembers} members. Upgrade to invite more.`,
      );
    }
  }

  private async claimExactSlug(slug: string): Promise<string> {
    if (await this.repository.slugExists(slug)) {
      throw ApiException.conflict('ORGANIZATION_SLUG_TAKEN', 'That name is already taken.');
    }
    return slug;
  }

  /**
   * Derives a slug from the display name, suffixing until one is free.
   *
   * This is a best-effort pre-check; the unique index on `slug` is the real
   * guarantee, and a concurrent creation surfaces as a conflict rather than a
   * duplicate.
   */
  private async claimDerivedSlug(name: string): Promise<string> {
    const base = slugifyOrganizationName(name);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      if (!(await this.repository.slugExists(candidate))) {
        return candidate;
      }
    }

    throw ApiException.conflict(
      'ORGANIZATION_SLUG_TAKEN',
      'Could not derive a unique name. Choose one explicitly.',
    );
  }
}

export function toOrganizationDto(
  organization: OrganizationRecord,
  websiteCount: number,
): OrganizationDto {
  return {
    id: organization._id.toHexString(),
    name: organization.name,
    slug: organization.slug,
    plan: organization.plan,
    timezone: organization.timezone,
    websiteCount,
    createdAt: organization.createdAt.toISOString(),
  };
}

export function toMembershipDto(entry: MembershipWithOrganization): OrganizationMembershipDto {
  return {
    organization: toOrganizationDto(entry.organization, entry.websiteCount),
    role: entry.membership.role,
    permissions: permissionsFor(entry.membership.role),
    joinedAt: entry.membership.joinedAt.toISOString(),
  };
}
