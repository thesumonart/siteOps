import { Injectable } from '@nestjs/common';
import { WebsiteModel, type Types } from '@siteops/database';
import type { CursorPaginatedResult, IncidentDto, ListIncidentsQuery } from '@siteops/shared';

import { ApiException } from '../common/errors/api-exception.js';
import { decodeOptionalCursor, encodeCursor } from '../common/pagination/cursor.js';
import { type OrganizationContext } from '../organizations/organization.types.js';
import { IncidentRepository, type IncidentRecord } from './incident.repository.js';

/** The website fields an incident row displays, resolved in one query per page. */
interface WebsiteLabel {
  readonly name: string;
  readonly url: string;
}

@Injectable()
export class IncidentService {
  constructor(private readonly repository: IncidentRepository) {}

  async list(
    organization: OrganizationContext,
    query: ListIncidentsQuery,
  ): Promise<CursorPaginatedResult<IncidentDto>> {
    const rows = await this.repository.list({
      organizationId: organization.objectId,
      pageSize: query.pageSize,
      status: query.status,
      websiteId: query.websiteId,
      cursor: decodeOptionalCursor(query.cursor),
    });

    // The repository fetches one extra row purely to answer "is there more?".
    const hasNextPage = rows.length > query.pageSize;
    const items = hasNextPage ? rows.slice(0, query.pageSize) : rows;
    const last = items.at(-1);

    const labels = await this.labelsFor(items);

    return {
      items: items.map((incident) =>
        toIncidentDto(incident, labels.get(incident.websiteId.toHexString())),
      ),
      pagination: {
        nextCursor: hasNextPage && last ? encodeCursor(last.startedAt, last._id) : null,
        hasNextPage,
        pageSize: query.pageSize,
      },
    };
  }

  async getById(organization: OrganizationContext, incidentId: string): Promise<IncidentDto> {
    const incident = await this.repository.findById(organization.objectId, incidentId);
    if (!incident) {
      throw ApiException.notFound('INCIDENT_NOT_FOUND', 'Incident not found.');
    }

    const labels = await this.labelsFor([incident]);
    return toIncidentDto(incident, labels.get(incident.websiteId.toHexString()));
  }

  /**
   * Resolves website names for a page of incidents in one query.
   *
   * The name is denormalized onto the response rather than the document,
   * because renaming a website should change how its past incidents read — the
   * incident is about the site, not about the name it had that day.
   */
  private async labelsFor(
    incidents: readonly IncidentRecord[],
  ): Promise<ReadonlyMap<string, WebsiteLabel>> {
    if (incidents.length === 0) return new Map();

    const websiteIds = [...new Set(incidents.map((incident) => incident.websiteId.toHexString()))];
    const rows = await WebsiteModel.find({ _id: { $in: incidents.map((i) => i.websiteId) } })
      .select({ name: 1, url: 1 })
      .lean<{ _id: Types.ObjectId; name: string; url: string }[]>()
      .exec();

    const byId = new Map(rows.map((row) => [row._id.toHexString(), row]));
    return new Map(
      websiteIds.map((id) => {
        const row = byId.get(id);
        // A website deleted after its incidents were purged should not happen —
        // deletion removes both — but a missing row must not blank the page.
        return [id, { name: row?.name ?? 'Deleted website', url: row?.url ?? '' }];
      }),
    );
  }
}

export function toIncidentDto(incident: IncidentRecord, website?: WebsiteLabel): IncidentDto {
  return {
    id: incident._id.toHexString(),
    organizationId: incident.organizationId.toHexString(),
    websiteId: incident.websiteId.toHexString(),
    websiteName: website?.name ?? 'Deleted website',
    websiteUrl: website?.url ?? '',
    status: incident.status,
    type: incident.type,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    durationSeconds: incident.durationSeconds,
    failedCheckCount: incident.failedCheckCount,
    lastStatusCode: incident.lastStatusCode,
    lastErrorType: incident.lastErrorType,
    lastErrorMessage: incident.lastErrorMessage,
  };
}
