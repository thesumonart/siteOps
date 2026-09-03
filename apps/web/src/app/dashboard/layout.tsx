import { permissionsFor } from '@siteops/shared';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganizationId } from '@/lib/active-organization';
import { fetchSession } from '@/lib/auth';

/**
 * Resolves who is signed in and which organization they are viewing, before
 * anything reaches the browser.
 *
 * The middleware only checks that a session cookie exists — enough to avoid a
 * dashboard flash for a signed-out visitor, but not proof of anything. This is
 * where the session is actually verified, by asking the API.
 */
export default async function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.ReactElement> {
  // A server component makes its own request and does not inherit the browser's
  // cookies, so they are forwarded explicitly.
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');

  const session = await fetchSession(cookie ? { cookie } : undefined);

  if (!session) {
    redirect('/login?next=%2Fdashboard');
  }
  if (!session.user.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`);
  }
  if (session.memberships.length === 0) {
    redirect('/onboarding');
  }

  const cookieStore = await cookies();
  const storedId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
  const activeOrganizationId = resolveActiveOrganizationId(
    storedId,
    session.memberships.map((entry) => entry.organization.id),
  );

  const active =
    session.memberships.find((entry) => entry.organization.id === activeOrganizationId) ??
    session.memberships[0];

  if (!active || activeOrganizationId === null) {
    redirect('/onboarding');
  }

  return (
    <DashboardShell
      user={session.user}
      memberships={session.memberships}
      activeOrganizationId={activeOrganizationId}
      permissions={permissionsFor(active.role)}
    >
      {children}
    </DashboardShell>
  );
}
