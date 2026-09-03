import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_STATUSES,
} from '@siteops/shared';
import type { NotificationChannel, NotificationEvent, NotificationStatus } from '@siteops/shared';
import { Schema, model, models, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface NotificationAttributes {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  event: NotificationEvent;
  channel: NotificationChannel;
  status: NotificationStatus;
  websiteId: Types.ObjectId | null;
  incidentId: Types.ObjectId | null;
  title: string;
  body: string;
  /**
   * Deterministic identity for "this notification, for this recipient, about
   * this incident". A unique index on it makes duplicate delivery impossible
   * even if the notification job runs twice.
   */
  dedupeKey: string;
  sentAt: Date | null;
  failureReason: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<NotificationAttributes>;

const notificationSchema = new Schema<NotificationAttributes>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    event: { type: String, required: true, enum: NOTIFICATION_EVENTS },
    channel: { type: String, required: true, enum: NOTIFICATION_CHANNELS, default: 'email' },
    status: { type: String, required: true, enum: NOTIFICATION_STATUSES, default: 'pending' },
    websiteId: { type: Schema.Types.ObjectId, ref: 'Website', default: null },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', default: null },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 2000 },
    dedupeKey: { type: String, required: true, maxlength: 200 },
    sentAt: { type: Date, default: null },
    failureReason: { type: String, default: null, maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notifications' },
);

// The deduplication guarantee. See `dedupeKey`.
notificationSchema.index({ dedupeKey: 1 }, { unique: true, name: 'notification_dedupe_unique' });

// Backs the in-app notification feed for one user in one organization.
notificationSchema.index(
  { userId: 1, organizationId: 1, createdAt: -1 },
  { name: 'notification_user_org_created_at' },
);

// Backs the unread badge without scanning the feed.
notificationSchema.index(
  { userId: 1, readAt: 1, createdAt: -1 },
  { name: 'notification_user_unread' },
);

export const NotificationModel: Model<NotificationAttributes> =
  (models.Notification as Model<NotificationAttributes> | undefined) ??
  model<NotificationAttributes>('Notification', notificationSchema);

/**
 * Per-user, per-organization delivery preferences.
 *
 * Stored separately from the user so a person can be noisy about one client's
 * websites and quiet about another's.
 */
export interface NotificationSettingsAttributes {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  websiteDown: boolean;
  websiteRecovered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationSettingsDocument = HydratedDocument<NotificationSettingsAttributes>;

const notificationSettingsSchema = new Schema<NotificationSettingsAttributes>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    websiteDown: {
      type: Boolean,
      required: true,
      default: DEFAULT_NOTIFICATION_PREFERENCES.websiteDown,
    },
    websiteRecovered: {
      type: Boolean,
      required: true,
      default: DEFAULT_NOTIFICATION_PREFERENCES.websiteRecovered,
    },
  },
  { timestamps: true, collection: 'notification_settings' },
);

notificationSettingsSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true, name: 'notification_settings_org_user_unique' },
);

export const NotificationSettingsModel: Model<NotificationSettingsAttributes> =
  (models.NotificationSettings as Model<NotificationSettingsAttributes> | undefined) ??
  model<NotificationSettingsAttributes>('NotificationSettings', notificationSettingsSchema);
