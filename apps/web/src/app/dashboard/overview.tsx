'use client';

import {
  INCIDENT_TYPE_LABELS,
  formatDuration,
  formatResponseTime,
  formatUptimePercentage,
  type WebsiteStatus,
} from '@siteops/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { RelativeTime } from '@/components/relative-time';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/lib/query-keys';
import { fetchDashboardStats, fetchIncidents } from '@/lib/monitoring';

export interface OverviewProps {
  readonly organizationId: string;
  readonly canAddWebsite: boolean;
}

/** Statuses worth calling out, in the order someone scanning the page cares about. */
const BREAKDOWN: readonly WebsiteStatus[] = [
  'down',
  'degraded',
  'operational',
  'paused',
  'unknown',
];

export function Overview({ organizationId, canAddWebsite }: OverviewProps): React.ReactElement {
  const stats = useQuery({
    queryKey: queryKeys.dashboardStats(organizationId),
    queryFn: () => fetchDashboardStats(),
    // The worker writes continuously; a stale overview is misleading in a way a
    // stale settings page is not.
    refetchInterval: 30_000,
  });

  const incidents = useQuery({
    queryKey: queryKeys.incidents(organizationId, { pageSize: 5 }),
    queryFn: () => fetchIncidents({ pageSize: 5 }),
    refetchInterval: 30_000,
  });

  if (stats.isPending) {
    return (
      <div className="flex items-center gap-2" aria-busy="true" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Loading overview…</span>
      </div>
    );
  }

  if (stats.isError) {
    return (
      <Alert variant="error" title="Could not load the overview">
        The monitoring data could not be read just now. Nothing has stopped — checks keep running.
      </Alert>
    );
  }

  const data = stats.data;

  if (data.totalWebsites === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing is being monitored yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Add a website and SiteOps starts checking it right away. Uptime, response times and
            incidents appear here as soon as there are real checks to report.
          </p>
          {canAddWebsite ? (
            <Button size="sm" asChild className="mt-4">
              <Link href="/dashboard/websites">Add a website</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Websites"
          value={String(data.totalWebsites)}
          hint={`${String(data.operational)} operational`}
        />
        <SummaryCard
          label="Uptime, last 24h"
          value={formatUptimePercentage(data.averageUptimePercentage24h)}
          hint={
            data.averageUptimePercentage24h === null
              ? 'No checks recorded yet'
              : 'Across every monitored site'
          }
        />
        <SummaryCard
          label="Response time, last 24h"
          value={formatResponseTime(data.averageResponseTimeMs24h)}
          hint={
            data.averageResponseTimeMs24h === null
              ? 'No successful checks yet'
              : 'Successful checks only'
          }
        />
        <SummaryCard
          label="Open incidents"
          value={String(data.openIncidents)}
          hint={data.openIncidents === 0 ? 'Everything is resolved' : 'Currently unresolved'}
          emphasis={data.openIncidents > 0}
        />
      </div>

      <section aria-labelledby="breakdown-heading" className="rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 id="breakdown-heading" className="text-sm font-medium">
            Status breakdown
          </h2>
        </div>
        <ul className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          {BREAKDOWN.map((status) => (
            <li key={status} className="flex items-center justify-between gap-3">
              <StatusBadge status={status} />
              <span className="tabular-figures font-mono text-sm">{countFor(data, status)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-incidents-heading" className="rounded-xl border">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 id="recent-incidents-heading" className="text-sm font-medium">
            Recent incidents
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/incidents">
              All incidents
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {incidents.isPending ? (
          <p className="px-5 py-6 text-sm text-muted-foreground" aria-busy="true">
            Loading incidents…
          </p>
        ) : incidents.isError ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Incidents could not be loaded just now.
          </p>
        ) : incidents.data.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-pretty text-muted-foreground">
            No incidents have been recorded. Nothing monitored here has failed its confirmation
            threshold.
          </p>
        ) : (
          <ul className="divide-y">
            {incidents.data.items.map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/dashboard/websites/${incident.websiteId}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {incident.websiteName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {INCIDENT_TYPE_LABELS[incident.type]} ·{' '}
                      <RelativeTime iso={incident.startedAt} />
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {incident.status === 'open' ? (
                      <span className="font-medium text-status-down">Ongoing</span>
                    ) : incident.durationSeconds !== null ? (
                      `Down for ${formatDuration(incident.durationSeconds)}`
                    ) : (
                      'Resolved'
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function countFor(
  data: { operational: number; degraded: number; down: number; paused: number; unknown: number },
  status: WebsiteStatus,
): number {
  return data[status];
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly emphasis?: boolean;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            emphasis
              ? 'tabular-figures font-mono text-2xl text-status-down'
              : 'tabular-figures font-mono text-2xl'
          }
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
