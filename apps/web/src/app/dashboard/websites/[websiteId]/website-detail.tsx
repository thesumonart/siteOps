'use client';

import {
  MONITORING_INTERVAL_LABELS,
  MONITORING_INTERVALS_SECONDS,
  WEBSITE_STATUS_PRESENTATION,
  formatResponseTime,
  type MonitoringIntervalSeconds,
  type Permission,
} from '@siteops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Loader2, Pause, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RelativeTime } from '@/components/relative-time';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { deleteWebsite, fetchWebsite, setWebsiteMonitoring, updateWebsite } from '@/lib/websites';
import { cn } from '@/lib/utils';
import { WebsiteMonitoring } from './website-monitoring';

export interface WebsiteDetailProps {
  readonly organizationId: string;
  readonly websiteId: string;
  readonly permissions: readonly Permission[];
  readonly minIntervalSeconds: number;
}

export function WebsiteDetail({
  organizationId,
  websiteId,
  permissions,
  minIntervalSeconds,
}: WebsiteDetailProps): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const canUpdate = permissions.includes('website:update');
  const canToggle = permissions.includes('monitoring:toggle');
  const canDelete = permissions.includes('website:delete');

  const query = useQuery({
    queryKey: queryKeys.website(organizationId, websiteId),
    queryFn: () => fetchWebsite(websiteId),
  });

  const onError = (error: Error): void => {
    setActionError(error instanceof ApiError ? error.message : 'Something went wrong.');
  };

  const refresh = async (): Promise<void> => {
    setActionError(null);
    await queryClient.invalidateQueries({
      queryKey: ['organizations', organizationId, 'websites'],
    });
  };

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => setWebsiteMonitoring(websiteId, enabled),
    onSuccess: refresh,
    onError,
  });

  const intervalMutation = useMutation({
    mutationFn: (seconds: MonitoringIntervalSeconds) =>
      updateWebsite(websiteId, { monitoringIntervalSeconds: seconds }),
    onSuccess: refresh,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWebsite(websiteId),
    onSuccess: async () => {
      await refresh();
      router.replace('/dashboard/websites');
    },
    onError,
  });

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2" aria-busy="true" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Loading website…</span>
      </div>
    );
  }

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Alert variant="error" title={notFound ? 'Website not found' : 'Could not load this website'}>
        {notFound
          ? 'It may have been deleted, or it belongs to a different organization.'
          : 'Something went wrong.'}
        <div className="mt-3">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/websites">Back to websites</Link>
          </Button>
        </div>
      </Alert>
    );
  }

  const website = query.data;
  const busy = toggleMutation.isPending || intervalMutation.isPending || deleteMutation.isPending;

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/dashboard/websites"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Websites
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{website.name}</h1>
            <a
              href={website.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {website.url}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={website.status} />
            {canToggle ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  toggleMutation.mutate(!website.monitoringEnabled);
                }}
              >
                {website.monitoringEnabled ? (
                  <>
                    <Pause aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play aria-hidden="true" />
                    Resume
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Current status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {WEBSITE_STATUS_PRESENTATION[website.status].label}
            </p>
            <p className="mt-1 text-xs text-pretty text-muted-foreground">
              {WEBSITE_STATUS_PRESENTATION[website.status].description}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last response</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-figures font-mono text-lg">
              {formatResponseTime(website.lastResponseTimeMs)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {website.lastStatusCode !== null
                ? `HTTP ${website.lastStatusCode}`
                : 'No response yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last checked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {website.lastCheckedAt ? (
                <RelativeTime iso={website.lastCheckedAt} />
              ) : (
                'Awaiting first check'
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {/* The label already reads "Every 5 minutes"; do not prefix it. */}
              {MONITORING_INTERVAL_LABELS[
                website.monitoringIntervalSeconds as MonitoringIntervalSeconds
              ] ?? `Every ${website.monitoringIntervalSeconds}s`}
            </p>
          </CardContent>
        </Card>
      </div>

      <WebsiteMonitoring organizationId={organizationId} websiteId={websiteId} />

      <section aria-labelledby="settings-heading" className="rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 id="settings-heading" className="text-sm font-medium">
            Monitoring settings
          </h2>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="detail-interval">Check interval</Label>
            <select
              id="detail-interval"
              value={website.monitoringIntervalSeconds}
              disabled={!canUpdate || busy}
              onChange={(event) => {
                intervalMutation.mutate(Number(event.target.value) as MonitoringIntervalSeconds);
              }}
              className={cn(
                'h-9 cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs',
                'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {MONITORING_INTERVALS_SECONDS.filter((seconds) => seconds >= minIntervalSeconds).map(
                (seconds) => (
                  <option key={seconds} value={seconds}>
                    {MONITORING_INTERVAL_LABELS[seconds]}
                  </option>
                ),
              )}
            </select>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Confirm an outage after</dt>
              <dd className="tabular-figures mt-0.5 font-mono">
                {website.failureThreshold} failed checks
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Confirm recovery after</dt>
              <dd className="tabular-figures mt-0.5 font-mono">
                {website.recoveryThreshold} successful checks
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Request timeout</dt>
              <dd className="tabular-figures mt-0.5 font-mono">{website.requestTimeoutMs} ms</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Added</dt>
              <dd className="mt-0.5">
                <RelativeTime iso={website.createdAt} />
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {canDelete ? (
        <section
          aria-labelledby="danger-heading"
          className="rounded-xl border border-destructive/30"
        >
          <div className="border-b border-destructive/30 px-5 py-4">
            <h2 id="danger-heading" className="text-sm font-medium text-destructive">
              Delete this website
            </h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="max-w-md text-sm text-pretty text-muted-foreground">
              Monitoring stops immediately and the check history and incidents for this site are
              removed. This cannot be undone.
            </p>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDeleteConfirmation('');
                setConfirmDelete(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        </section>
      ) : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {website.name}?</DialogTitle>
            <DialogDescription>
              This removes the website, its check history and its incidents. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="confirm-name">
              Type <span className="font-mono">{website.name}</span> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={deleteConfirmation}
              onChange={(event) => {
                setDeleteConfirmation(event.target.value);
              }}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDelete(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              // Typing the name is the guard against an accidental click on an
              // irreversible action.
              disabled={deleteConfirmation !== website.name || deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                'Delete website'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
