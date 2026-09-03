import {
  IncidentModel,
  NotificationModel,
  NotificationSettingsModel,
  OrganizationMemberModel,
  UserModel,
  type Types,
} from '@siteops/database';
import { formatDuration, type CheckErrorType } from '@siteops/shared';

import { env } from '../config/env.js';
import { type EmailService } from '../email/email.service.js';
import { websiteDownTemplate, websiteRecoveredTemplate } from '../email/templates/index.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('notification');

export interface NotifiableWebsite {
  readonly id: Types.ObjectId;
  readonly organizationId: Types.ObjectId;
  readonly name: string;
  readonly url: string;
}

interface Recipient {
  readonly userId: Types.ObjectId;
  readonly email: string;
  readonly name: string;
}

/**
 * Notifies every eligible organization member that a website went down.
 *
 * Idempotency has two layers. First, `incident.downNotifiedAt` is claimed with
 * a conditional update (`{downNotifiedAt: null}` in the filter) — a job that
 * runs twice for the same incident sees the field already set on its second
 * attempt and does nothing further. Second, even within one dispatch, each
 * recipient's `Notification` document has a deterministic `dedupeKey`; the
 * unique index on it makes a duplicate insert impossible rather than merely
 * unlikely.
 */
export async function notifyWebsiteDown(
  website: NotifiableWebsite,
  incidentId: Types.ObjectId,
  emailService: EmailService,
): Promise<void> {
  const claimed = await claimDispatch(incidentId, 'downNotifiedAt');
  if (!claimed) return;

  // The incident document, not a hand-built context, is the source of truth:
  // it was written by `incident-service.ts` in the same request that decided
  // to open this incident, so reading it back here cannot drift from what was
  // actually persisted.
  const incident = await IncidentModel.findById(incidentId)
    .select({ startedAt: 1, failedCheckCount: 1, lastStatusCode: 1, lastErrorType: 1 })
    .lean<{
      startedAt: Date;
      failedCheckCount: number;
      lastStatusCode: number | null;
      lastErrorType: CheckErrorType | null;
    }>()
    .exec();
  if (!incident) return;

  const recipients = await resolveRecipients(website.organizationId, 'websiteDown');
  if (recipients.length === 0) return;

  const dashboardUrl = `${env.APP_URL}/dashboard/websites/${website.id.toHexString()}`;
  const content = websiteDownTemplate({
    websiteName: website.name,
    websiteUrl: website.url,
    startedAt: incident.startedAt,
    failedCheckCount: incident.failedCheckCount,
    lastStatusCode: incident.lastStatusCode,
    lastErrorType: incident.lastErrorType,
    dashboardUrl,
  });

  await dispatchToRecipients(
    recipients,
    {
      organizationId: website.organizationId,
      event: 'website.down',
      websiteId: website.id,
      incidentId,
      title: `${website.name} is down`,
      body: `Started at ${incident.startedAt.toISOString()}, after ${incident.failedCheckCount} consecutive failed checks.`,
    },
    content,
    emailService,
  );
}

export async function notifyWebsiteRecovered(
  website: NotifiableWebsite,
  incidentId: Types.ObjectId,
  emailService: EmailService,
): Promise<void> {
  const claimed = await claimDispatch(incidentId, 'recoveryNotifiedAt');
  if (!claimed) return;

  const incident = await IncidentModel.findById(incidentId)
    .select({ resolvedAt: 1, durationSeconds: 1 })
    .lean<{ resolvedAt: Date | null; durationSeconds: number | null }>()
    .exec();
  if (!incident?.resolvedAt || incident.durationSeconds === null) return;

  const recipients = await resolveRecipients(website.organizationId, 'websiteRecovered');
  if (recipients.length === 0) return;

  const dashboardUrl = `${env.APP_URL}/dashboard/websites/${website.id.toHexString()}`;
  const content = websiteRecoveredTemplate({
    websiteName: website.name,
    websiteUrl: website.url,
    resolvedAt: incident.resolvedAt,
    durationSeconds: incident.durationSeconds,
    dashboardUrl,
  });

  await dispatchToRecipients(
    recipients,
    {
      organizationId: website.organizationId,
      event: 'website.recovered',
      websiteId: website.id,
      incidentId,
      title: `${website.name} has recovered`,
      body: `Resolved at ${incident.resolvedAt.toISOString()}. Was down for ${formatDuration(incident.durationSeconds)}.`,
    },
    content,
    emailService,
  );
}

/** Atomically claims the incident-level dispatch flag for one event. */
async function claimDispatch(
  incidentId: Types.ObjectId,
  field: 'downNotifiedAt' | 'recoveryNotifiedAt',
): Promise<boolean> {
  const result = await IncidentModel.updateOne(
    { _id: incidentId, [field]: null },
    { $set: { [field]: new Date() } },
  ).exec();

  return result.modifiedCount > 0;
}

async function resolveRecipients(
  organizationId: Types.ObjectId,
  preference: 'websiteDown' | 'websiteRecovered',
): Promise<readonly Recipient[]> {
  const members = await OrganizationMemberModel.find({ organizationId })
    .select({ userId: 1 })
    .lean<{ userId: Types.ObjectId }[]>()
    .exec();

  if (members.length === 0) return [];
  const userIds = members.map((member) => member.userId);

  const [users, settings] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } })
      .select({ email: 1, name: 1, emailVerified: 1 })
      .lean<{ _id: Types.ObjectId; email: string; name: string; emailVerified: boolean }[]>()
      .exec(),
    NotificationSettingsModel.find({ organizationId, userId: { $in: userIds } })
      .select({ userId: 1, websiteDown: 1, websiteRecovered: 1 })
      .lean<{ userId: Types.ObjectId; websiteDown: boolean; websiteRecovered: boolean }[]>()
      .exec(),
  ]);

  const settingsByUser = new Map(settings.map((row) => [row.userId.toHexString(), row]));

  return users
    .filter((user) => user.emailVerified)
    .filter((user) => {
      const explicit = settingsByUser.get(user._id.toHexString());
      // No stored preference defaults to on: silently not alerting on an
      // outage is worse than one extra email.
      return explicit ? explicit[preference] : true;
    })
    .map((user) => ({ userId: user._id, email: user.email, name: user.name }));
}

interface DispatchMeta {
  readonly organizationId: Types.ObjectId;
  readonly event: 'website.down' | 'website.recovered';
  readonly websiteId: Types.ObjectId;
  readonly incidentId: Types.ObjectId;
  readonly title: string;
  readonly body: string;
}

async function dispatchToRecipients(
  recipients: readonly Recipient[],
  meta: DispatchMeta,
  content: { readonly subject: string; readonly html: string; readonly text: string },
  emailService: EmailService,
): Promise<void> {
  for (const recipient of recipients) {
    const dedupeKey = `${meta.incidentId.toHexString()}:${meta.event}:${recipient.userId.toHexString()}`;

    let notification;
    try {
      notification = await NotificationModel.create({
        organizationId: meta.organizationId,
        userId: recipient.userId,
        event: meta.event,
        channel: 'email',
        status: 'pending',
        websiteId: meta.websiteId,
        incidentId: meta.incidentId,
        title: meta.title,
        body: meta.body,
        dedupeKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }

    const result = await emailService.send({ to: recipient.email, ...content });

    await NotificationModel.updateOne(
      { _id: notification._id },
      result.delivered
        ? { $set: { status: 'sent', sentAt: new Date() } }
        : { $set: { status: 'failed', failureReason: result.reason ?? 'Unknown delivery error.' } },
    ).exec();

    if (!result.delivered) {
      logger.error(
        { userId: recipient.userId.toHexString(), event: meta.event, reason: result.reason },
        'notification.delivery_failed',
      );
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}
