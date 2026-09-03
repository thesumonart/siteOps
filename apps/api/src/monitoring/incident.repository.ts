import { Injectable } from '@nestjs/common';
import { IncidentModel, toObjectId, type IncidentAttributes, type Types } from '@siteops/database';
import type { IncidentStatus } from '@siteops/shared';

import { cursorFilter, type DecodedCursor } from '../common/pagination/cursor.js';

export interface IncidentRecord extends IncidentAttributes {
  readonly _id: Types.ObjectId;
}

export interface ListIncidentsFilter {
  readonly organizationId: Types.ObjectId;
  readonly pageSize: number;
  readonly status?: IncidentStatus | undefined;
  readonly websiteId?: string | undefined;
  readonly cursor?: DecodedCursor | undefined;
}

/**
 * Incident data access.
 *
 * Incidents are read far more often than they are written and are ordered
 * newest-first everywhere, so every query here is served by
 * `incident_org_started_at` or `incident_org_status_started_at`.
 *
 * Like every other repository, `organizationId` is part of the filter rather
 * than something verified afterwards: an incident belonging to another tenant
 * does not resolve at all.
 */
@Injectable()
export class IncidentRepository {
  /**
   * Fetches one page, plus one extra document used only to decide whether a
   * next page exists — cheaper than a matching `countDocuments`, and it cannot
   * disagree with the page it was computed from.
   */
  async list(filter: ListIncidentsFilter): Promise<readonly IncidentRecord[]> {
    const query: Record<string, unknown> = { organizationId: filter.organizationId };

    if (filter.status) query.status = filter.status;

    if (filter.websiteId) {
      const websiteObjectId = toObjectId(filter.websiteId);
      // An unparseable id is not an error: it simply matches nothing, the same
      // as an id for a website in another organization.
      if (!websiteObjectId) return [];
      query.websiteId = websiteObjectId;
    }

    if (filter.cursor) {
      Object.assign(query, cursorFilter('startedAt', filter.cursor));
    }

    return (
      IncidentModel.find(query)
        // `_id` breaks ties so the cursor cannot skip or repeat an incident when
        // two websites fail in the same millisecond; the index carries both keys.
        .sort({ startedAt: -1, _id: -1 })
        .limit(filter.pageSize + 1)
        .lean<IncidentRecord[]>()
        .exec()
    );
  }

  async findById(
    organizationId: Types.ObjectId,
    incidentId: string,
  ): Promise<IncidentRecord | null> {
    const incidentObjectId = toObjectId(incidentId);
    if (!incidentObjectId) return null;

    return IncidentModel.findOne({ _id: incidentObjectId, organizationId })
      .lean<IncidentRecord>()
      .exec();
  }

  async countOpen(organizationId: Types.ObjectId): Promise<number> {
    return IncidentModel.countDocuments({ organizationId, status: 'open' }).exec();
  }

  /** The open incident for each of the given websites, keyed by website id. */
  async openIncidentIdsFor(
    organizationId: Types.ObjectId,
    websiteIds: readonly Types.ObjectId[],
  ): Promise<ReadonlyMap<string, string>> {
    if (websiteIds.length === 0) return new Map();

    const rows = await IncidentModel.find({
      organizationId,
      status: 'open',
      websiteId: { $in: websiteIds },
    })
      .select({ websiteId: 1 })
      .lean<{ _id: Types.ObjectId; websiteId: Types.ObjectId }[]>()
      .exec();

    return new Map(rows.map((row) => [row.websiteId.toHexString(), row._id.toHexString()]));
  }
}
