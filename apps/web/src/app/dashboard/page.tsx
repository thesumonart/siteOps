import { PLAN_LABELS, permissionsFor } from '@siteops/shared';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganizationId } from '@/lib/active-organization';
import { fetchSession } from '@/lib/auth';
import { Overview } from './overview';

export const metadata: Metadata = {
  title: 'Overview',
};

/**
 * Organization overview.
 *
 * Shows only what the product actually measures. Every figure below comes from
 * checks the worker performed; a site with no checks yet reports nothing rather
 * than a flattering default.
 */
export default async function DashboardPage(): Promise<React.ReactElement> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const session = await fetchSession(cookie ? { cookie } : undefined);

  if (!session) redirect('/login?next=%2Fdashboard');

  const cookieStore = await cookies();
  const activeId = resolveActiveOrganizationId(
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null,
    session.memberships.map((entry) => entry.organization.id),
  );
  const active = session.memberships.find((entry) => entry.organization.id === activeId);
  if (!active) redirect('/onboarding');

  const permissions = permissionsFor(active.role);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{active.organization.name}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {PLAN_LABELS[active.organization.plan]} plan · you are an {active.role}
        </p>
      </header>

      <Overview
        organizationId={active.organization.id}
        canAddWebsite={permissions.includes('website:create')}
      />
    </div>
  );
}
