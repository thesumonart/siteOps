'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { useEffect, useState } from 'react';

const REFRESH_INTERVAL_MS = 30_000;

export interface RelativeTimeProps {
  /** UTC ISO 8601 timestamp, as every API date is. */
  readonly iso: string;
  readonly className?: string;
}

/**
 * A timestamp rendered as "3 minutes ago", in the reader's own timezone.
 *
 * Server and client would disagree about "now", so the absolute time is
 * rendered first and swapped for the relative one after mount — that avoids a
 * hydration mismatch without hiding the value from a reader who has JavaScript
 * disabled. The exact time is always available in the tooltip.
 */
export function RelativeTime({ iso, className }: RelativeTimeProps): React.ReactElement {
  const date = new Date(iso);
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    const target = new Date(iso);
    const update = (): void => {
      setRelative(`${formatDistanceToNowStrict(target)} ago`);
    };
    update();

    // Re-rendered on a timer so "just now" does not stay wrong on an open tab.
    const timer = setInterval(update, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [iso]);

  return (
    <time dateTime={iso} title={date.toLocaleString()} className={className}>
      {relative ?? date.toLocaleTimeString()}
    </time>
  );
}
