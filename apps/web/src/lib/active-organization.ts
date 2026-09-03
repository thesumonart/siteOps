/**
 * Which organization the dashboard is currently showing.
 *
 * Stored in a plain, non-HttpOnly cookie so both server components and the
 * browser can read it. It is deliberately *not* a credential: the API resolves
 * membership from the session on every request and treats this value as a hint
 * only, so tampering with it can at worst produce a 404.
 */
export const ACTIVE_ORGANIZATION_COOKIE = 'siteops.active_org';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readActiveOrganizationCookie(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${ACTIVE_ORGANIZATION_COOKIE}=`));

  return match ? decodeURIComponent(match.slice(ACTIVE_ORGANIZATION_COOKIE.length + 1)) : null;
}

export function writeActiveOrganizationCookie(organizationId: string): void {
  if (typeof document === 'undefined') return;

  // `Lax` matches the session cookie so the two travel together on navigation.
  document.cookie = `${ACTIVE_ORGANIZATION_COOKIE}=${encodeURIComponent(organizationId)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * Picks the organization to show.
 *
 * The stored preference wins only if the person is still a member of it — a
 * membership can be revoked between visits, and falling back to the first
 * available organization is better than rendering a dead dashboard.
 */
export function resolveActiveOrganizationId(
  storedId: string | null,
  availableIds: readonly string[],
): string | null {
  if (storedId && availableIds.includes(storedId)) return storedId;
  return availableIds[0] ?? null;
}
