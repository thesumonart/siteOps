import { Injectable } from '@nestjs/common';
import {
  STATS_RANGE_HOURS,
  bucketSizeSecondsFor,
  calculateUptimePercentage,
  estimateDowntimeSeconds,
  type CursorPaginatedResult,
  type DashboardStatsDto,
  type ListWebsiteChecksQuery,
  type StatsRange,
  type UptimeBucketDto,
  type UptimeStatsDto,
  type WebsiteCheckDto,
} from '@siteops/shared';

import { ApiException } from '../common/errors/api-exception.js';
import { decodeOptionalCursor, encodeCursor } from '../common/pagination/cursor.js';
import { type OrganizationContext } from '../organizations/organization.types.js';
import { WebsiteRepository, type WebsiteRecord } from '../websites/website.repository.js';
import { CheckRepository, type CheckRecord, type CheckTotals } from './check.repository.js';
import { IncidentRepository } from './incident.repository.js';

function windowStart(range: StatsRange, now: Date): Date {
  return new Date(now.getTime() - STATS_RANGE_HOURS[range] * 60 * 60 * 1000);
}

/**
 * Reads of recorded monitoring data.
 *
 * Every number here comes from checks the worker actually performed. A website
 * with no checks yet reports `null`, never `100%` — an unmeasured site is not
 * a healthy one, and a placeholder figure on a status page is worse than an
 * empty one.
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly checks: CheckRepository,
    private readonly incidents: IncidentRepository,
    private readonly websites: WebsiteRepository,
  ) {}

  async websiteStats(
    organization: OrganizationContext,
    websiteId: string,
    range: StatsRange,
  ): Promise<UptimeStatsDto> {
    const website = await this.requireWebsite(organization, websiteId);
    const since = windowStart(range, new Date());

    const totals = await this.checks.totalsForWebsite(website._id, since);

    return {
      range,
      totalChecks: totals.totalChecks,
      successfulChecks: totals.successfulChecks,
      failedChecks: totals.totalChecks - totals.successfulChecks,
      uptimePercentage: calculateUptimePercentage(totals.successfulChecks, totals.totalChecks),
      // Estimated from check counts, at the resolution polling allows. The
      // incident's own duration is the exact figure and is what its page shows.
      downtimeSeconds: estimateDowntimeSeconds(
        totals.totalChecks - totals.successfulChecks,
        website.monitoringIntervalSeconds,
      ),
      averageResponseTimeMs: totals.averageResponseTimeMs,
      fastestResponseTimeMs: totals.fastestResponseTimeMs,
      slowestResponseTimeMs: totals.slowestResponseTimeMs,
    };
  }

  async websiteBuckets(
    organization: OrganizationContext,
    websiteId: string,
    range: StatsRange,
  ): Promise<readonly UptimeBucketDto[]> {
    const website = await this.requireWebsite(organization, websiteId);
    const hours = STATS_RANGE_HOURS[range];
    const since = windowStart(range, new Date());

    const buckets = await this.checks.bucketsForWebsite(
      website._id,
      since,
      bucketSizeSecondsFor(hours),
    );

    return buckets.map((bucket) => ({
      bucketStart: bucket.bucketStart.toISOString(),
      totalChecks: bucket.totalChecks,
      successfulChecks: bucket.successfulChecks,
      uptimePercentage: calculateUptimePercentage(bucket.successfulChecks, bucket.totalChecks),
      averageResponseTimeMs: bucket.averageResponseTimeMs,
    }));
  }

  async websiteChecks(
    organization: OrganizationContext,
    websiteId: string,
    query: ListWebsiteChecksQuery,
  ): Promise<CursorPaginatedResult<WebsiteCheckDto>> {
    const website = await this.requireWebsite(organization, websiteId);

    const rows = await this.checks.list({
      websiteId: website._id,
      pageSize: query.pageSize,
      status: query.status,
      cursor: decodeOptionalCursor(query.cursor),
    });

    const hasNextPage = rows.length > query.pageSize;
    const items = hasNextPage ? rows.slice(0, query.pageSize) : rows;
    const last = items.at(-1);

    return {
      items: items.map(toCheckDto),
      pagination: {
        nextCursor: hasNextPage && last ? encodeCursor(last.checkedAt, last._id) : null,
        hasNextPage,
        pageSize: query.pageSize,
      },
    };
  }

  /**
   * The organization overview.
   *
   * Status counts come from the website documents, which the worker keeps
   * current, rather than from re-deriving state out of the check history — the
   * two must not be able to disagree on the dashboard.
   */
  async dashboardStats(organization: OrganizationContext): Promise<DashboardStatsDto> {
    const since = windowStart('24h', new Date());

    const [byStatus, totalsByWebsite, openIncidents] = await Promise.all([
      this.websites.countByStatus(organization.objectId),
      this.checks.totalsByWebsite(organization.objectId, since),
      this.incidents.countOpen(organization.objectId),
    ]);

    const combined = combineTotals([...totalsByWebsite.values()]);

    return {
      totalWebsites: [...byStatus.values()].reduce((sum, count) => sum + count, 0),
      operational: byStatus.get('operational') ?? 0,
      degraded: byStatus.get('degraded') ?? 0,
      down: byStatus.get('down') ?? 0,
      paused: byStatus.get('paused') ?? 0,
      unknown: byStatus.get('unknown') ?? 0,
      averageUptimePercentage24h: calculateUptimePercentage(
        combined.successfulChecks,
        combined.totalChecks,
      ),
      averageResponseTimeMs24h: combined.averageResponseTimeMs,
      openIncidents,
    };
  }

  /** Resolves a website within the tenant, or 404s. Every read here starts with this. */
  private async requireWebsite(
    organization: OrganizationContext,
    websiteId: string,
  ): Promise<WebsiteRecord> {
    const website = await this.websites.findById(organization.objectId, websiteId);
    if (!website) {
      throw ApiException.notFound('WEBSITE_NOT_FOUND', 'Website not found.');
    }
    return website;
  }
}

/**
 * Folds per-website totals into one organization-wide figure.
 *
 * The average response time is weighted by how many successful checks each
 * website contributed. Averaging the per-site averages would give a site
 * checked every five minutes the same weight as one checked every minute.
 */
function combineTotals(totals: readonly CheckTotals[]): {
  readonly totalChecks: number;
  readonly successfulChecks: number;
  readonly averageResponseTimeMs: number | null;
} {
  let totalChecks = 0;
  let successfulChecks = 0;
  let responseTimeTotal = 0;
  let responseTimeWeight = 0;

  for (const entry of totals) {
    totalChecks += entry.totalChecks;
    successfulChecks += entry.successfulChecks;

    if (entry.averageResponseTimeMs !== null && entry.successfulChecks > 0) {
      responseTimeTotal += entry.averageResponseTimeMs * entry.successfulChecks;
      responseTimeWeight += entry.successfulChecks;
    }
  }

  return {
    totalChecks,
    successfulChecks,
    averageResponseTimeMs:
      responseTimeWeight > 0 ? Math.round(responseTimeTotal / responseTimeWeight) : null,
  };
}

export function toCheckDto(check: CheckRecord): WebsiteCheckDto {
  return {
    id: check._id.toHexString(),
    websiteId: check.websiteId.toHexString(),
    status: check.status,
    statusCode: check.statusCode,
    responseTimeMs: check.responseTimeMs,
    checkedAt: check.checkedAt.toISOString(),
    errorType: check.errorType,
    errorMessage: check.errorMessage,
    redirectCount: check.redirectCount,
  };
}
