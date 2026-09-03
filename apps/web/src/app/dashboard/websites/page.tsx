import { PLAN_LABELS, limitsFor, permissionsFor } from '@siteops/shared';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganizationId } from '@/lib/active-organization';
import { fetchSession } from '@/lib/auth';
import { WebsitesTable } from './websites-table';

export const metadata: Metadata = {
  title: 'Websites',
};

export default async function WebsitesPage(): Promise<React.ReactElement> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const session = await fetchSession(cookie ? { cookie } : undefined);

  if (!session) redirect('/login?next=%2Fdashboard%2Fwebsites');

  const cookieStore = await cookies();
  const activeId = resolveActiveOrganizationId(
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null,
    session.memberships.map((entry) => entry.organization.id),
  );
  const active = session.memberships.find((entry) => entry.organization.id === activeId);
  if (!active || activeId === null) redirect('/onboarding');

  const limits = limitsFor(active.organization.plan);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Websites</h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Every site {active.organization.name} monitors.
        </p>
      </header>

      <WebsitesTable
        organizationId={activeId}
        permissions={permissionsFor(active.role)}
        minIntervalSeconds={limits.minMonitoringIntervalSeconds}
        maxWebsites={limits.maxWebsites}
        planLabel={PLAN_LABELS[active.organization.plan]}
      />
    </div>
  );
}
