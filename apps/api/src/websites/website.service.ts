import { Injectable } from '@nestjs/common';
import { buildOffsetMeta } from '@siteops/shared';
import {
  limitsFor,
  normalizeWebsiteUrl,
  type CreateWebsiteInput,
  type ListWebsitesQuery,
  type OffsetPaginatedResult,
  type UpdateWebsiteInput,
  type WebsiteDto,
} from '@siteops/shared';

import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/errors/api-exception.js';
import { createLogger } from '../common/logging/logger.js';
import { type OrganizationContext } from '../organizations/organization.types.js';
import { WebsiteRepository, type WebsiteRecord } from './website.repository.js';

const logger = createLogger('websites');

/** MongoDB's duplicate-key error. */
const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === DUPLICATE_KEY
  );
}

interface Actor {
  readonly id: string;
  readonly name: string;
}

@Injectable()
export class WebsiteService {
  constructor(
    private readonly repository: WebsiteRepository,
    private readonly audit: AuditService,
  ) {}

  async list(
    organization: OrganizationContext,
    query: ListWebsitesQuery,
  ): Promise<OffsetPaginatedResult<WebsiteDto>> {
    const { items, totalItems } = await this.repository.list({
      organizationId: organization.objectId,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
    });

    return {
      items: items.map(toWebsiteDto),
      pagination: buildOffsetMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getById(organization: OrganizationContext, websiteId: string): Promise<WebsiteDto> {
    const website = await this.repository.findById(organization.objectId, websiteId);
    if (!website) {
      throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');
    }
    return toWebsiteDto(website);
  }

  /**
   * Adds a website to the organization.
   *
   * The URL has already been normalized by `createWebsiteSchema`; it is
   * re-normalized here to derive the canonical key, because the service must
   * hold on its own rather than trusting that a caller used the pipe.
   */
  async create(
    organization: OrganizationContext,
    input: CreateWebsiteInput,
    actor: Actor,
  ): Promise<WebsiteDto> {
    const normalized = normalizeWebsiteUrl(input.url);
    if (!normalized.ok) {
      // The string-level SSRF check. The authoritative one runs in the worker
      // against the resolved address, immediately before connecting.
      throw ApiException.badRequest(
        normalized.reason === 'blocked_ip' || normalized.reason === 'blocked_hostname'
          ? 'BLOCKED_WEBSITE_URL'
          : 'INVALID_WEBSITE_URL',
        normalized.detail,
      );
    }

    await this.assertWithinPlan(organization, input.monitoringIntervalSeconds);

    try {
      const website = await this.repository.create({
        organizationId: organization.objectId,
        name: input.name,
        url: normalized.value.href,
        canonicalKey: normalized.value.canonicalKey,
        monitoringIntervalSeconds: input.monitoringIntervalSeconds,
        requestTimeoutMs: input.requestTimeoutMs,
        failureThreshold: input.failureThreshold,
        recoveryThreshold: input.recoveryThreshold,
      });

      await this.audit.record({
        organizationId: organization.objectId,
        action: 'website.created',
        actorUserId: actor.id,
        actorName: actor.name,
        targetType: 'website',
        targetId: website._id,
        targetLabel: website.name,
      });

      logger.info(
        { organizationId: organization.id, websiteId: website._id.toHexString() },
        'website.created',
      );

      return toWebsiteDto(website);
    } catch (error) {
      // The unique index is the real guarantee, so a double-submitted form
      // surfaces here rather than creating a second monitor.
      if (isDuplicateKeyError(error)) {
        throw ApiException.conflict(
          'WEBSITE_URL_ALREADY_MONITORED',
          'This organization is already monitoring that URL.',
        );
      }
      throw error;
    }
  }

  async update(
    organization: OrganizationContext,
    websiteId: string,
    input: UpdateWebsiteInput,
    actor: Actor,
  ): Promise<WebsiteDto> {
    const existing = await this.repository.findById(organization.objectId, websiteId);
    if (!existing) {
      throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');
    }

    const changes: Parameters<WebsiteRepository['update']>[2] = {};

    if (input.name !== undefined) changes.name = input.name;

    if (input.url !== undefined) {
      const normalized = normalizeWebsiteUrl(input.url);
      if (!normalized.ok) {
        throw ApiException.badRequest(
          normalized.reason === 'blocked_ip' || normalized.reason === 'blocked_hostname'
            ? 'BLOCKED_WEBSITE_URL'
            : 'INVALID_WEBSITE_URL',
          normalized.detail,
        );
      }
      changes.url = normalized.value.href;
      changes.canonicalKey = normalized.value.canonicalKey;

      // Pointing at a different address makes the accumulated failure and
      // recovery counters meaningless, so the confirmation state restarts.
      if (normalized.value.canonicalKey !== existing.canonicalKey) {
        changes.consecutiveFailures = 0;
        changes.consecutiveSuccesses = 0;
        changes.status = existing.monitoringEnabled ? 'unknown' : 'paused';
        changes.nextCheckAt = new Date();
      }
    }

    if (input.monitoringIntervalSeconds !== undefined) {
      await this.assertWithinPlan(organization, input.monitoringIntervalSeconds, {
        countsTowardsLimit: false,
      });
      changes.monitoringIntervalSeconds = input.monitoringIntervalSeconds;
    }
    if (input.requestTimeoutMs !== undefined) changes.requestTimeoutMs = input.requestTimeoutMs;
    if (input.failureThreshold !== undefined) changes.failureThreshold = input.failureThreshold;
    if (input.recoveryThreshold !== undefined) changes.recoveryThreshold = input.recoveryThreshold;

    try {
      const updated = await this.repository.update(organization.objectId, websiteId, changes);
      if (!updated) throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');

      await this.audit.record({
        organizationId: organization.objectId,
        action: 'website.updated',
        actorUserId: actor.id,
        actorName: actor.name,
        targetType: 'website',
        targetId: updated._id,
        targetLabel: updated.name,
      });

      return toWebsiteDto(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw ApiException.conflict(
          'WEBSITE_URL_ALREADY_MONITORED',
          'This organization is already monitoring that URL.',
        );
      }
      throw error;
    }
  }

  async setMonitoring(
    organization: OrganizationContext,
    websiteId: string,
    enabled: boolean,
    actor: Actor,
  ): Promise<WebsiteDto> {
    const existing = await this.repository.findById(organization.objectId, websiteId);
    if (!existing) {
      throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');
    }

    const updated = await this.repository.update(organization.objectId, websiteId, {
      monitoringEnabled: enabled,
      // Resuming starts from a clean slate rather than resuming a stale
      // failure streak from before the pause.
      status: enabled ? 'unknown' : 'paused',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      nextCheckAt: new Date(),
    });
    if (!updated) throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');

    await this.audit.record({
      organizationId: organization.objectId,
      action: enabled ? 'website.monitoring_resumed' : 'website.monitoring_paused',
      actorUserId: actor.id,
      actorName: actor.name,
      targetType: 'website',
      targetId: updated._id,
      targetLabel: updated.name,
    });

    return toWebsiteDto(updated);
  }

  async delete(organization: OrganizationContext, websiteId: string, actor: Actor): Promise<void> {
    const deleted = await this.repository.delete(organization.objectId, websiteId);
    if (!deleted) {
      throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');
    }

    // Incidents are few and are removed with the website. Checks can number in
    // the hundreds of thousands, so they are cleaned up without blocking the
    // response — they are unreachable once the website is gone (every query
    // scopes by websiteId) and expire on their own via the TTL index.
    await this.repository.deleteIncidentsFor(deleted._id);
    void this.repository
      .deleteChecksFor(deleted._id)
      .then((count) => {
        logger.info({ websiteId: deleted._id.toHexString(), count }, 'website.checks_purged');
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, websiteId: deleted._id.toHexString() },
          'website.checks_purge_failed',
        );
      });

    await this.audit.record({
      organizationId: organization.objectId,
      action: 'website.deleted',
      actorUserId: actor.id,
      actorName: actor.name,
      targetType: 'website',
      targetId: deleted._id,
      targetLabel: deleted.name,
    });

    logger.info(
      { organizationId: organization.id, websiteId: deleted._id.toHexString() },
      'website.deleted',
    );
  }

  /**
   * Plan limits, read from the organization's stored plan.
   *
   * Nothing about a plan is ever taken from the client, and both the count cap
   * and the minimum interval are checked here rather than in the controller so
   * the worker could call the same path.
   */
  private async assertWithinPlan(
    organization: OrganizationContext,
    intervalSeconds: number,
    options: { readonly countsTowardsLimit?: boolean } = {},
  ): Promise<void> {
    const limits = limitsFor(organization.plan);

    if (options.countsTowardsLimit !== false) {
      const current = await this.repository.countForOrganization(organization.objectId);
      if (current >= limits.maxWebsites) {
        throw ApiException.planLimit(
          `The ${organization.plan} plan monitors up to ${limits.maxWebsites} websites. Upgrade to add more.`,
        );
      }
    }

    if (intervalSeconds < limits.minMonitoringIntervalSeconds) {
      throw ApiException.planLimit(
        `The ${organization.plan} plan checks at most every ${limits.minMonitoringIntervalSeconds / 60} minutes.`,
      );
    }
  }
}

export function toWebsiteDto(website: WebsiteRecord): WebsiteDto {
  return {
    id: website._id.toHexString(),
    organizationId: website.organizationId.toHexString(),
    name: website.name,
    url: website.url,
    status: website.status,
    monitoringEnabled: website.monitoringEnabled,
    monitoringIntervalSeconds: website.monitoringIntervalSeconds,
    requestTimeoutMs: website.requestTimeoutMs,
    failureThreshold: website.failureThreshold,
    recoveryThreshold: website.recoveryThreshold,
    lastCheckedAt: website.lastCheckedAt?.toISOString() ?? null,
    lastSuccessfulCheckAt: website.lastSuccessfulCheckAt?.toISOString() ?? null,
    lastFailedAt: website.lastFailedAt?.toISOString() ?? null,
    lastResponseTimeMs: website.lastResponseTimeMs,
    lastStatusCode: website.lastStatusCode,
    createdAt: website.createdAt.toISOString(),
    updatedAt: website.updatedAt.toISOString(),
  };
}
