import { PLAN_LABELS, permissionsFor } from '@siteops/shared';
import { Building2, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganizationId } from '@/lib/active-organization';
import { fetchSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Overview',
};

/**
 * Organization overview.
 *
 * Shows only what the product actually measures today. Uptime, response times
 * and incidents appear here once the monitoring engine records them — nothing
 * on this page is invented to fill space.
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

  const canInvite = permissionsFor(active.role).includes('member:invite');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{active.organization.name}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {PLAN_LABELS[active.organization.plan]} plan · you are an {active.role}
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Websites monitored</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-figures font-mono text-2xl">{active.organization.websiteCount}</p>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              Website monitoring is the next thing being built. Nothing is being checked yet.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Your team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-pretty text-muted-foreground">
              {canInvite
                ? 'Invite the people who should see these sites, and choose what each of them can do.'
                : 'See who else has access to this organization.'}
            </p>
            <Button variant="outline" size="sm" asChild className="mt-3">
              <Link href="/dashboard/members">{canInvite ? 'Manage members' : 'View members'}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
