import { Injectable } from '@nestjs/common';
import { AuditLogModel, toObjectId, type Types } from '@siteops/database';
import type { AuditAction } from '@siteops/shared';

import { createLogger } from '../common/logging/logger.js';

const logger = createLogger('audit');

export interface AuditEntry {
  readonly organizationId: Types.ObjectId;
  readonly action: AuditAction;
  readonly actorUserId: string | null;
  /** Snapshot of the actor's name, so the feed survives a later rename. */
  readonly actorName: string;
  readonly targetType?: string;
  readonly targetId?: Types.ObjectId;
  readonly targetLabel?: string;
}

/**
 * Append-only record of who changed what inside an organization.
 *
 * Recording is best-effort by design: a failure to write the activity feed must
 * never roll back the action the user actually asked for. Failures are logged
 * so the gap is visible rather than silent.
 */
@Injectable()
export class AuditService {
  async record(entry: AuditEntry): Promise<void> {
    try {
      await AuditLogModel.create({
        organizationId: entry.organizationId,
        action: entry.action,
        actorUserId: entry.actorUserId ? toObjectId(entry.actorUserId) : null,
        actorName: entry.actorName,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error(
        { err: error, action: entry.action, organizationId: entry.organizationId.toHexString() },
        'audit.write_failed',
      );
    }
  }
}
