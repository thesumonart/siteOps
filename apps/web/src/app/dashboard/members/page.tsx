import { permissionsFor } from '@siteops/shared';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganizationId } from '@/lib/active-organization';
import { fetchSession } from '@/lib/auth';
import { MembersView } from './members-view';

export const metadata: Metadata = {
  title: 'Members',
};

export default async function MembersPage(): Promise<React.ReactElement> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const session = await fetchSession(cookie ? { cookie } : undefined);

  if (!session) redirect('/login?next=%2Fdashboard%2Fmembers');

  const cookieStore = await cookies();
  const activeId = resolveActiveOrganizationId(
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null,
    session.memberships.map((entry) => entry.organization.id),
  );
  const active = session.memberships.find((entry) => entry.organization.id === activeId);
  if (!active || activeId === null) redirect('/onboarding');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Who can see and manage the websites in {active.organization.name}.
        </p>
      </header>

      <MembersView
        organizationId={activeId}
        permissions={permissionsFor(active.role)}
        currentUserId={session.user.id}
      />
    </div>
  );
}
