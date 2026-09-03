'use client';

import { formatResponseTime, type UptimeBucketDto, type WebsiteStatus } from '@siteops/shared';

import { cn } from '@/lib/utils';

/**
 * Response time over the selected window, one bar per bucket.
 *
 * Hand-drawn with divs rather than a charting library: this is a bar per
 * bucket with no axes, tooltips or interaction, and a charting dependency
 * would cost more in bundle size than the whole component.
 *
 * Colour follows the same vocabulary as the rest of the product: a period
 * where every check passed is normal, one where some passed is degraded, one
 * where none passed is down. Painting a period fully red because a single
 * check in it failed would contradict an uptime figure of 85% printed directly
 * above the chart.
 *
 * Buckets with no checks at all are absent from the data rather than drawn as
 * zero — a gap means "not measured", and an unmeasured hour must not look like
 * a failed one.
 */
export interface UptimeChartProps {
  readonly buckets: readonly UptimeBucketDto[];
  readonly label: string;
}

export function UptimeChart({ buckets, label }: UptimeChartProps): React.ReactElement {
  if (buckets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-pretty text-muted-foreground">
        No checks were recorded in this window yet.
      </p>
    );
  }

  const peak = Math.max(
    ...buckets.map((bucket) => bucket.averageResponseTimeMs ?? 0),
    // Keeps a flat series of very fast responses from rendering as full-height
    // bars, which would read as though the site were slow.
    1,
  );

  return (
    <figure className="grid gap-2">
      <figcaption className="sr-only">{label}</figcaption>

      <div
        className="flex h-32 items-end gap-px overflow-hidden"
        role="img"
        aria-label={summarize(buckets, label)}
      >
        {buckets.map((bucket) => {
          const value = bucket.averageResponseTimeMs;
          // A bucket where nothing succeeded has no response time to show, so
          // it is drawn full height in the down colour instead of vanishing.
          const heightPercent = value === null ? 100 : Math.max(4, (value / peak) * 100);

          return (
            <div
              key={bucket.bucketStart}
              /*
               * `max-w` keeps a window holding only one or two buckets from
               * rendering as a wall of colour across the whole chart, which
               * reads as a far bigger event than it is.
               */
              className="flex h-full max-w-8 flex-1 items-end"
              title={describeBucket(bucket)}
            >
              <div
                className={cn('w-full rounded-t-[2px]', BAR_COLOUR[healthOf(bucket)])}
                style={{ height: `${String(heightPercent)}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatBucketTime(buckets[0]?.bucketStart)}</span>
        <span className="tabular-figures font-mono">peak {formatResponseTime(peak)}</span>
        <span>{formatBucketTime(buckets.at(-1)?.bucketStart)}</span>
      </div>
    </figure>
  );
}

type BucketHealth = Extract<WebsiteStatus, 'operational' | 'degraded' | 'down'>;

const BAR_COLOUR: Record<BucketHealth, string> = {
  operational: 'bg-primary/70',
  degraded: 'bg-status-degraded',
  down: 'bg-status-down',
};

/** Mirrors how a website's own status is described, so the two never disagree. */
function healthOf(bucket: UptimeBucketDto): BucketHealth {
  if (bucket.successfulChecks === 0) return 'down';
  if (bucket.successfulChecks < bucket.totalChecks) return 'degraded';
  return 'operational';
}

/** The chart's accessible equivalent: the same facts, without the picture. */
function summarize(buckets: readonly UptimeBucketDto[], label: string): string {
  const withFailures = buckets.filter(
    (bucket) => bucket.successfulChecks < bucket.totalChecks,
  ).length;
  const totalChecks = buckets.reduce((sum, bucket) => sum + bucket.totalChecks, 0);

  const periods = `${String(buckets.length)} ${buckets.length === 1 ? 'period' : 'periods'}`;
  const failures =
    withFailures === 0
      ? 'No period had a failed check.'
      : `${String(withFailures)} of ${periods} had at least one failed check.`;

  return `${label}. ${String(totalChecks)} checks across ${periods}. ${failures}`;
}

function describeBucket(bucket: UptimeBucketDto): string {
  const time = formatBucketTime(bucket.bucketStart);
  const response =
    bucket.averageResponseTimeMs === null
      ? 'no successful response'
      : formatResponseTime(bucket.averageResponseTimeMs);
  const failed = bucket.totalChecks - bucket.successfulChecks;

  return failed > 0
    ? `${time} · ${response} · ${String(failed)} failed`
    : `${time} · ${response} · ${String(bucket.totalChecks)} checks`;
}

function formatBucketTime(iso: string | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
