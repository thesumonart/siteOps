import { WEBSITE_STATUS_PRESENTATION, type WebsiteStatus } from '@siteops/shared';
import { CircleCheck, CircleHelp, CircleMinus, CirclePause, TriangleAlert } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The single way a website's health is rendered anywhere in the product.
 *
 * Status is conveyed three times over — icon shape, text label and colour — so
 * it survives colour blindness, greyscale printing and screen readers. Every
 * call site uses this component rather than colouring text itself, which is what
 * keeps that guarantee from eroding.
 *
 * Deliberately not a live region: a dashboard renders one of these per row, and
 * marking each as `role="status"` would make a screen reader re-announce the
 * whole table on every refresh. Status *changes* are announced once, by the
 * notification layer.
 */

const STATUS_ICON: Record<WebsiteStatus, React.ComponentType<{ className?: string }>> = {
  operational: CircleCheck,
  degraded: TriangleAlert,
  down: CircleMinus,
  paused: CirclePause,
  unknown: CircleHelp,
};

const STATUS_CLASSES: Record<WebsiteStatus, string> = {
  operational: 'bg-status-operational-subtle text-status-operational',
  degraded: 'bg-status-degraded-subtle text-status-degraded',
  down: 'bg-status-down-subtle text-status-down',
  paused: 'bg-status-paused-subtle text-status-paused',
  unknown: 'bg-status-unknown-subtle text-status-unknown',
};

const DOT_CLASSES: Record<WebsiteStatus, string> = {
  operational: 'bg-status-operational',
  degraded: 'bg-status-degraded',
  down: 'bg-status-down',
  paused: 'bg-status-paused',
  unknown: 'bg-status-unknown',
};

export interface StatusBadgeProps {
  readonly status: WebsiteStatus;
  /**
   * Hides the text label in space-constrained cells. The label stays in the
   * accessibility tree as visually-hidden text rather than becoming an
   * `aria-label`, so it is still selectable and translatable.
   */
  readonly iconOnly?: boolean;
  readonly className?: string;
}

export function StatusBadge({
  status,
  iconOnly = false,
  className,
}: StatusBadgeProps): React.ReactElement {
  const Icon = STATUS_ICON[status];
  const { label, description } = WEBSITE_STATUS_PRESENTATION[status];

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        STATUS_CLASSES[status],
        className,
      )}
      title={description}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {iconOnly ? <span className="sr-only">{`${label}. ${description}`}</span> : label}
    </span>
  );
}

/**
 * A bare dot for dense contexts such as the sidebar, paired with its own
 * visually-hidden label so it is never a colour-only signal.
 */
export function StatusDot({
  status,
  className,
}: {
  readonly status: WebsiteStatus;
  readonly className?: string;
}): React.ReactElement {
  const { label } = WEBSITE_STATUS_PRESENTATION[status];

  return (
    <span data-slot="status-dot" className={cn('inline-flex items-center', className)}>
      <span className={cn('size-2 rounded-full', DOT_CLASSES[status])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
