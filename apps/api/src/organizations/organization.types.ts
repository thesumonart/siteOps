import type { OrganizationRole, Permission, Plan } from '@siteops/shared';
import type { Types } from '@siteops/database';

/**
 * The caller's verified standing in one organization.
 *
 * Built by {@link OrganizationGuard} from the session, never from the request
 * body or header alone. Handlers scope their queries with `objectId`.
 */
export interface OrganizationContext {
  readonly id: string;
  readonly objectId: Types.ObjectId;
  readonly slug: string;
  readonly plan: Plan;
  readonly role: OrganizationRole;
  readonly permissions: readonly Permission[];
}
