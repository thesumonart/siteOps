import { DEFAULT_PLAN, ORGANIZATION_ROLES, PLANS } from '@siteops/shared';
import type { OrganizationRole, Plan } from '@siteops/shared';
import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface OrganizationAttributes {
  name: string;
  slug: string;
  plan: Plan;
  /** IANA zone used to render timestamps for everyone in the organization. */
  timezone: string;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationDocument = HydratedDocument<OrganizationAttributes>;

const organizationSchema = new Schema<OrganizationAttributes>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 48,
      // Uniqueness is enforced by the index declared below rather than by
      // `unique: true`, so index intent stays in one place.
    },
    plan: { type: String, required: true, enum: PLANS, default: DEFAULT_PLAN },
    timezone: { type: String, required: true, default: 'UTC', maxlength: 64 },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: true, collection: 'organizations' },
);

// Slugs appear in URLs and must be globally unique.
organizationSchema.index({ slug: 1 }, { unique: true, name: 'organization_slug_unique' });

export const OrganizationModel: Model<OrganizationAttributes> =
  (mongoose.models.Organization as Model<OrganizationAttributes> | undefined) ??
  model<OrganizationAttributes>('Organization', organizationSchema);

export interface OrganizationMemberAttributes {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: OrganizationRole;
  invitedByUserId: Types.ObjectId | null;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationMemberDocument = HydratedDocument<OrganizationMemberAttributes>;

const organizationMemberSchema = new Schema<OrganizationMemberAttributes>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    role: { type: String, required: true, enum: ORGANIZATION_ROLES, default: 'member' },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'organization_members' },
);

// A user holds exactly one role per organization. The unique index is the
// authority — it makes a duplicate invite a database error rather than a race.
organizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true, name: 'member_org_user_unique' },
);
// Backs "which organizations does this user belong to", run on every request
// that resolves the active organization.
organizationMemberSchema.index({ userId: 1 }, { name: 'member_by_user' });
// Backs the members table, sorted by seniority then join order.
organizationMemberSchema.index(
  { organizationId: 1, joinedAt: 1 },
  { name: 'member_org_joined_at' },
);

export const OrganizationMemberModel: Model<OrganizationMemberAttributes> =
  (mongoose.models.OrganizationMember as Model<OrganizationMemberAttributes> | undefined) ??
  model<OrganizationMemberAttributes>('OrganizationMember', organizationMemberSchema);
