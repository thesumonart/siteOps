import type { RequestAuthContext } from '../auth/auth.types.js';
import type { OrganizationContext } from '../organizations/organization.types.js';

/**
 * Express request augmentations owned by SiteOps middleware and guards.
 *
 * Declared centrally so a handler cannot read a field that nothing sets.
 */
declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by RequestContextMiddleware. */
      id: string;
      /** Set by AuthGuard on every non-public route. Absent on public routes. */
      auth?: RequestAuthContext;
      /** Set by OrganizationGuard on routes that declare a permission. */
      organization?: OrganizationContext;
    }
  }
}

export {};
