'use client';

import {
  CHECK_ERROR_LABELS,
  INCIDENT_TYPE_LABELS,
  formatDuration,
  type IncidentDto,
} from '@siteops/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { RelativeTime } from '@/components/relative-time';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query-keys';
import { fetchIncidents } from '@/lib/monitoring';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'open' | 'resolved';

const FILTERS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

const PAGE_SIZE = 20;

export interface IncidentsViewProps {
  readonly organizationId: string;
}

/**
 * Incident history, newest first.
 *
 * Paged by cursor rather than page number: incidents arrive while someone is
 * reading, and an offset would quietly shift every row down by one each time a
 * new outage is confirmed.
 */
export function IncidentsView({ organizationId }: IncidentsViewProps): React.ReactElement {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const query = useInfiniteQuery({
    queryKey: queryKeys.incidents(organizationId, { status: filter }),
    queryFn: ({ pageParam }) =>
      fetchIncidents({
        pageSize: PAGE_SIZE,
        ...(filter === 'all' ? {} : { status: filter }),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
  });

  const incidents = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-4">
      <div role="group" aria-label="Filter incidents" className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
            }}
            className={cn(
              'h-8 cursor-pointer rounded-md border px-3 text-sm transition-colors',
              'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              filter === value
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 py-8" aria-busy="true" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Loading incidents…</span>
        </div>
      ) : query.isError ? (
        <Alert variant="error" title="Could not load incidents">
          Something went wrong reading the incident history.
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void query.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </Alert>
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border px-5 py-10 text-center">
          <p className="text-sm font-medium">
            {filter === 'open' ? 'No open incidents' : 'No incidents recorded'}
          </p>
          <p className="mx-auto mt-1 max-w-prose text-sm text-pretty text-muted-foreground">
            {filter === 'open'
              ? 'Everything monitored here is currently responding.'
              : 'An incident is only opened once a site fails its confirmation threshold, so a single missed request never appears here.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {incidents.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}
          </ul>

          {query.hasNextPage ? (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={() => {
                  void query.fetchNextPage();
                }}
              >
                {query.isFetchingNextPage ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Loading…
                  </>
                ) : (
                  'Load older incidents'
                )}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function IncidentRow({ incident }: { readonly incident: IncidentDto }): React.ReactElement {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link
            href={`/dashboard/websites/${incident.websiteId}`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {incident.websiteName}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {INCIDENT_TYPE_LABELS[incident.type]} · started{' '}
            <RelativeTime iso={incident.startedAt} />
          </p>
        </div>

        <div className="text-right">
          {incident.status === 'open' ? (
            <span className="text-sm font-medium text-status-down">Ongoing</span>
          ) : (
            <span className="text-sm">
              {incident.durationSeconds === null
                ? 'Resolved'
                : `Down for ${formatDuration(incident.durationSeconds)}`}
            </span>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {incident.failedCheckCount} failed{' '}
            {incident.failedCheckCount === 1 ? 'check' : 'checks'}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-pretty text-muted-foreground">{describe(incident)}</p>
    </li>
  );
}

/**
 * The one-line reason, from what the checker actually recorded.
 *
 * A status code is more specific than an error type, so it wins when both are
 * present; when neither is, the row says so rather than guessing.
 */
function describe(incident: IncidentDto): string {
  if (incident.lastStatusCode !== null) {
    return `Last response: HTTP ${String(incident.lastStatusCode)}.`;
  }
  if (incident.lastErrorType) {
    return `Last failure: ${CHECK_ERROR_LABELS[incident.lastErrorType]}.`;
  }
  return 'No response was received.';
}
