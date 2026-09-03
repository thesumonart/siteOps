import { Injectable } from '@nestjs/common';
import { NotificationSettingsModel, toObjectIdOrThrow } from '@siteops/database';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationSettingsDto,
  type UpdateNotificationPreferencesInput,
} from '@siteops/shared';

import { type OrganizationContext } from '../organizations/organization.types.js';

const PREFERENCE_FIELDS = ['websiteDown', 'websiteRecovered'] as const;

type PreferenceField = (typeof PREFERENCE_FIELDS)[number];

/**
 * Per-user, per-organization alert preferences.
 *
 * Settings are scoped to both because someone who works across several client
 * organizations may want outage alerts for one and not another.
 *
 * A user with no stored row is notified. The absence of a preference means
 * "never asked", and defaulting that to silence would mean an outage nobody
 * hears about — the failure this product exists to prevent. The worker applies
 * the same default when it resolves recipients.
 */
@Injectable()
export class NotificationSettingsService {
  async get(organization: OrganizationContext, userId: string): Promise<NotificationSettingsDto> {
    const stored = await NotificationSettingsModel.findOne({
      organizationId: organization.objectId,
      userId: toObjectIdOrThrow(userId),
    })
      .select({ websiteDown: 1, websiteRecovered: 1 })
      .lean<{ websiteDown: boolean; websiteRecovered: boolean }>()
      .exec();

    return {
      preferences: stored
        ? { websiteDown: stored.websiteDown, websiteRecovered: stored.websiteRecovered }
        : DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }

  /**
   * Applies a partial change, creating the row on first write.
   *
   * `$set` of only the supplied fields, with the defaults supplied on insert,
   * so turning one event off never silently rewrites the other to whatever the
   * browser last had in memory.
   */
  async update(
    organization: OrganizationContext,
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationSettingsDto> {
    const changes: Partial<Record<PreferenceField, boolean>> = {};
    for (const field of PREFERENCE_FIELDS) {
      const value = input[field];
      if (value !== undefined) changes[field] = value;
    }

    if (Object.keys(changes).length === 0) {
      return this.get(organization, userId);
    }

    // A field may not appear in both `$set` and `$setOnInsert` — MongoDB
    // rejects the update outright — so the insert defaults cover only the
    // fields this request is not setting.
    const defaults: Partial<Record<PreferenceField, boolean>> = {};
    for (const field of PREFERENCE_FIELDS) {
      if (changes[field] === undefined) defaults[field] = DEFAULT_NOTIFICATION_PREFERENCES[field];
    }

    const updated = await NotificationSettingsModel.findOneAndUpdate(
      { organizationId: organization.objectId, userId: toObjectIdOrThrow(userId) },
      { $set: changes, $setOnInsert: defaults },
      { upsert: true, returnDocument: 'after' },
    )
      .select({ websiteDown: 1, websiteRecovered: 1 })
      .lean<{ websiteDown: boolean; websiteRecovered: boolean }>()
      .exec();

    return {
      preferences: updated
        ? { websiteDown: updated.websiteDown, websiteRecovered: updated.websiteRecovered }
        : DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }
}
