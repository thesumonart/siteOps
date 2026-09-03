'use client';

import {
  CHECK_ERROR_LABELS,
  INCIDENT_TYPE_LABELS,
  STATS_RANGES,
  STATS_RANGE_LABELS,
  formatDuration,
  formatResponseTime,
  formatUptimePercentage,
  type StatsRange,
  type WebsiteCheckDto,
} from '@siteops/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { RelativeTime } from '@/components/relative-time';
import { UptimeChart } from '@/components/uptime-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchIncidents,
  fetchWebsiteChecks,
  fetchWebsiteStats,
  fetchWebsiteUptime,
} from '@/lib/monitoring';
import { cn } from '@/lib/utils';

const CHECK_PAGE_SIZE = 20;

export interface WebsiteMonitoringProps {
  readonly organizationId: string;
  readonly websiteId: string;
}

/**
 * Everything measured about one website: uptime for a chosen window, the
 * response-time series, its incident history and the most recent raw checks.
 *
 * The raw check list matters as much as the summaries — when someone doubts a
 * number on this page, the individual checks behind it are what settles it.
 */
export function WebsiteMonitoring({
  organizationId,
  websiteId,
}: WebsiteMonitoringProps): React.ReactElement {
  const [range, setRange] = useState<StatsRange>('24h');

  const stats = useQuery({
    queryKey: queryKeys.websiteStats(organizationId, websiteId, range),
    queryFn: () => fetchWebsiteStats(websiteId, range),
    refetchInterval: 60_000,
  });

  const uptime = useQuery({
    queryKey: queryKeys.websiteUptime(organizationId, websiteId, range),
    queryFn: () => fetchWebsiteUptime(websiteId, range),
    refetchInterval: 60_000,
  });

  const checks = useQuery({
    queryKey: queryKeys.websiteChecks(organizationId, websiteId, { pageSize: CHECK_PAGE_SIZE }),
    queryFn: () => fetchWebsiteChecks(websiteId, { pageSize: CHECK_PAGE_SIZE }),
    refetchInterval: 60_000,
  });

  const incidents = useQuery({
    queryKey: queryKeys.incidents(organizationId, { websiteId }),
    queryFn: () => fetchIncidents({ websiteId, pageSize: 10 }),
    refetchInterval: 60_000,
  });

  return (
    <div className="grid gap-6">
      <div role="group" aria-label="Statistics range" className="flex flex-wrap gap-1.5">
        {STATS_RANGES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => {
              setRange(value);
            }}
            className={cn(
              'h-8 cursor-pointer rounded-md border px-3 text-sm transition-colors',
              'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              range === value
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted',
            )}
          >
            {STATS_RANGE_LABELS[value]}
          </button>
        ))}
      </div>

      {stats.isPending ? (
        <LoadingRow label="Loading statistics…" />
      ) : stats.isError ? (
        <p className="text-sm text-muted-foreground">Statistics could not be loaded just now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Uptime"
            value={formatUptimePercentage(stats.data.uptimePercentage)}
            hint={
              stats.data.totalChecks === 0
                ? 'No checks in this window'
                : `${String(stats.data.successfulChecks)} of ${String(stats.data.totalChecks)} checks succeeded`
            }
          />
          <StatCard
            label="Average response"
            value={formatResponseTime(stats.data.averageResponseTimeMs)}
            hint="Successful checks only"
          />
          <StatCard
            label="Fastest / slowest"
            value={
              stats.data.fastestResponseTimeMs === null
                ? '—'
                : `${formatResponseTime(stats.data.fastestResponseTimeMs)} / ${formatResponseTime(stats.data.slowestResponseTimeMs)}`
            }
            hint="Range of successful responses"
          />
          <StatCard
            label="Estimated downtime"
            value={stats.data.failedChecks === 0 ? '—' : formatDuration(stats.data.downtimeSeconds)}
            hint={
              stats.data.failedChecks === 0
                ? 'No failed checks in this window'
                : 'Failed checks × the check interval'
            }
          />
        </div>
      )}

      <section aria-labelledby="response-heading" className="rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 id="response-heading" className="text-sm font-medium">
            Response time
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Amber where some checks in a period failed, red where none succeeded.
          </p>
        </div>
        <div className="px-5 py-4">
          {uptime.isPending ? (
            <LoadingRow label="Loading chart…" />
          ) : uptime.isError ? (
            <p className="text-sm text-muted-foreground">The chart could not be loaded.</p>
          ) : (
            <UptimeChart
              buckets={uptime.data}
              label={`Response time, ${STATS_RANGE_LABELS[range].toLowerCase()}`}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="incident-history-heading" className="rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 id="incident-history-heading" className="text-sm font-medium">
            Incident history
          </h2>
        </div>
        {incidents.isPending ? (
          <div className="px-5 py-4">
            <LoadingRow label="Loading incidents…" />
          </div>
        ) : incidents.isError ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Incidents could not be loaded.</p>
        ) : incidents.data.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-pretty text-muted-foreground">
            This website has never failed enough consecutive checks to open an incident.
          </p>
        ) : (
          <ul className="divide-y">
            {incidents.data.items.map((incident) => (
              <li
                key={incident.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm">{INCIDENT_TYPE_LABELS[incident.type]}</span>
                  <span className="block text-xs text-muted-foreground">
                    Started <RelativeTime iso={incident.startedAt} /> · {incident.failedCheckCount}{' '}
                    failed {incident.failedCheckCount === 1 ? 'check' : 'checks'}
                  </span>
                </span>
                <span className="text-xs">
                  {incident.status === 'open' ? (
                    <span className="font-medium text-status-down">Ongoing</span>
                  ) : incident.durationSeconds !== null ? (
                    <span className="text-muted-foreground">
                      Down for {formatDuration(incident.durationSeconds)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Resolved</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="checks-heading" className="rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 id="checks-heading" className="text-sm font-medium">
            Recent checks
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The individual requests every number on this page is derived from.
          </p>
        </div>

        {checks.isPending ? (
          <div className="px-5 py-4">
            <LoadingRow label="Loading checks…" />
          </div>
        ) : checks.isError ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Checks could not be loaded.</p>
        ) : checks.data.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-pretty text-muted-foreground">
            No checks recorded yet. The first one runs within a minute of the site being added.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                The most recent {String(checks.data.items.length)} checks, newest first
              </caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-5 py-2 font-medium">
                    Result
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">
                    Response
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {checks.data.items.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CheckRow({ check }: { readonly check: WebsiteCheckDto }): React.ReactElement {
  const succeeded = check.status === 'up';

  return (
    <tr>
      <td className="px-5 py-2 whitespace-nowrap">
        <RelativeTime iso={check.checkedAt} />
      </td>
      <td className="px-5 py-2">
        <span className={cn('text-xs font-medium', succeeded ? '' : 'text-status-down')}>
          {describeResult(check)}
        </span>
      </td>
      <td className="tabular-figures px-5 py-2 text-right font-mono text-xs">
        {formatResponseTime(check.responseTimeMs)}
      </td>
    </tr>
  );
}

/** Says what the checker recorded, preferring the most specific fact it has. */
function describeResult(check: WebsiteCheckDto): string {
  if (check.statusCode !== null) return `HTTP ${String(check.statusCode)}`;
  if (check.errorType) return CHECK_ERROR_LABELS[check.errorType];
  return check.status === 'up' ? 'OK' : 'Failed';
}

function LoadingRow({ label }: { readonly label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2" aria-busy="true" aria-live="polite">
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="tabular-figures font-mono text-lg">{value}</p>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
