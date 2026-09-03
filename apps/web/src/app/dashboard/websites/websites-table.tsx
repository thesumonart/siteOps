'use client';

import {
  WEBSITE_STATUSES,
  WEBSITE_STATUS_PRESENTATION,
  displayUrl,
  formatResponseTime,
  type Permission,
  type WebsiteStatus,
} from '@siteops/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Globe, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AddWebsiteDialog } from './add-website-dialog';
import { RelativeTime } from '@/components/relative-time';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { fetchWebsites } from '@/lib/websites';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

export interface WebsitesTableProps {
  readonly organizationId: string;
  readonly permissions: readonly Permission[];
  readonly minIntervalSeconds: number;
  readonly maxWebsites: number;
  readonly planLabel: string;
}

export function WebsitesTable({
  organizationId,
  permissions,
  minIntervalSeconds,
  maxWebsites,
  planLabel,
}: WebsitesTableProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WebsiteStatus | ''>('');
  const [page, setPage] = useState(1);

  const canCreate = permissions.includes('website:create');
  const filters = { search, status, page };

  const query = useQuery({
    queryKey: queryKeys.websites(organizationId, filters),
    queryFn: () =>
      fetchWebsites({
        page,
        pageSize: PAGE_SIZE,
        ...(search.length > 0 ? { search } : {}),
        ...(status === '' ? {} : { status }),
      }),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a skeleton on every keystroke.
    placeholderData: keepPreviousData,
  });

  if (query.isError) {
    return (
      <Alert variant="error" title="Could not load websites">
        {query.error instanceof ApiError ? query.error.message : 'Something went wrong.'}
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
    );
  }

  const data = query.data;
  const isFiltered = search.length > 0 || status.length > 0;

  // A first load with no filters and no results is genuinely empty; the same
  // thing with filters applied is a different message.
  if (!query.isPending && data?.items.length === 0 && !isFiltered) {
    return (
      <div className="rounded-xl border px-6 py-12 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
          <Globe className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-sm font-medium">No websites yet</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
          Add your first website to start monitoring uptime and response time. Checks begin
          immediately.
        </p>
        {canCreate ? (
          <div className="mt-5 flex justify-center">
            <AddWebsiteDialog
              organizationId={organizationId}
              minIntervalSeconds={minIntervalSeconds}
            />
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Ask an owner or admin to add the first one.
          </p>
        )}
      </div>
    );
  }

  /*
   * Usage is read from the live query rather than the server-rendered session,
   * which goes stale the moment a website is added without a full navigation.
   */
  const usedCount = data?.pagination.totalItems ?? 0;

  return (
    <div className="grid gap-4">
      <p className="-mt-2 text-sm text-muted-foreground">
        <span className="tabular-figures font-mono">{usedCount}</span> of{' '}
        <span className="tabular-figures font-mono">{maxWebsites}</span> websites used on the{' '}
        {planLabel} plan.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="website-search" className="sr-only">
            Search websites
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="website-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or URL"
              className="pl-9"
              type="search"
            />
          </div>
        </div>

        <div>
          <label htmlFor="website-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="website-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as WebsiteStatus | '');
              setPage(1);
            }}
            className={cn(
              'h-9 cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs',
              'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            )}
          >
            <option value="">All statuses</option>
            {WEBSITE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {WEBSITE_STATUS_PRESENTATION[value].label}
              </option>
            ))}
          </select>
        </div>

        {canCreate ? (
          <AddWebsiteDialog
            organizationId={organizationId}
            minIntervalSeconds={minIntervalSeconds}
          />
        ) : null}
      </div>

      {query.isPending ? (
        <TableSkeleton />
      ) : data?.items.length === 0 ? (
        <div className="rounded-xl border px-6 py-10 text-center">
          <p className="text-sm font-medium">No websites match those filters</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setSearch('');
              setStatus('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {/* Wide content scrolls inside its own container so the page body
              never scrolls sideways on a phone. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Websites monitored by this organization</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Website
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Response
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Last check
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.items.map((website) => (
                  <tr key={website.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/websites/${website.id}`}
                        className="rounded-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {website.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{displayUrl(website.url)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={website.status} />
                    </td>
                    <td className="tabular-figures px-4 py-3 text-right font-mono text-xs">
                      {formatResponseTime(website.lastResponseTimeMs)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {website.lastCheckedAt ? (
                        <RelativeTime iso={website.lastCheckedAt} />
                      ) : (
                        'Awaiting first check'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.pagination.totalPages > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <p className="text-xs text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.totalPages} ·{' '}
            {data.pagination.totalItems} websites
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.pagination.hasNextPage || query.isFetching}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function TableSkeleton(): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-xl border" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading websites…</span>
      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Loading websites…
      </div>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
          <div className="flex-1">
            <div className="h-3.5 w-32 rounded bg-muted" />
            <div className="mt-1.5 h-3 w-44 rounded bg-muted" />
          </div>
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="h-3 w-14 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
