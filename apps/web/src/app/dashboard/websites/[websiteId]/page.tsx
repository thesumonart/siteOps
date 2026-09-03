import { limitsFor, permissionsFor } from '@siteops/shared';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganizationId } from '@/lib/active-organization';
import { fetchSession } from '@/lib/auth';
import { WebsiteDetail } from './website-detail';

export const metadata: Metadata = {
  title: 'Website',
};

export default async function WebsiteDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly websiteId: string }>;
}): Promise<React.ReactElement> {
  const { websiteId } = await params;

  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const session = await fetchSession(cookie ? { cookie } : undefined);

  if (!session) redirect(`/login?next=${encodeURIComponent(`/dashboard/websites/${websiteId}`)}`);

  const cookieStore = await cookies();
  const activeId = resolveActiveOrganizationId(
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null,
    session.memberships.map((entry) => entry.organization.id),
  );
  const active = session.memberships.find((entry) => entry.organization.id === activeId);
  if (!active || activeId === null) redirect('/onboarding');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <WebsiteDetail
        organizationId={activeId}
        websiteId={websiteId}
        permissions={permissionsFor(active.role)}
        minIntervalSeconds={limitsFor(active.organization.plan).minMonitoringIntervalSeconds}
      />
    </div>
  );
}
