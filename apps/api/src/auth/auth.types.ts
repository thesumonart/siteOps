/** Injection token for the Better Auth instance. */
export const AUTH_INSTANCE = 'SITEOPS_AUTH_INSTANCE';

/**
 * The authenticated principal, as resolved from the session cookie.
 *
 * Deliberately narrow: handlers get an id, an address and a verification flag,
 * never the raw session record. Anything more would tempt callers to trust
 * client-influenced fields.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

export interface AuthenticatedSession {
  readonly id: string;
  readonly expiresAt: Date;
}

export interface RequestAuthContext {
  readonly user: AuthenticatedUser;
  readonly session: AuthenticatedSession;
}
