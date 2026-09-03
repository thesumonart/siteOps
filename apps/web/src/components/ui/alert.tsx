import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const VARIANT_STYLES = {
  info: 'bg-muted text-foreground border-border',
  success: 'bg-status-operational-subtle text-status-operational border-transparent',
  error: 'bg-status-down-subtle text-status-down border-transparent',
} as const;

const VARIANT_ICON = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
} as const;

export interface AlertProps {
  readonly variant?: keyof typeof VARIANT_STYLES;
  readonly title?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/**
 * Inline status message.
 *
 * Errors are announced assertively so a screen reader interrupts with a failed
 * submission; anything else is polite and waits its turn.
 */
export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: AlertProps): React.ReactElement {
  const Icon = VARIANT_ICON[variant];
  const isError = variant === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title ? 'mt-0.5' : '', 'text-pretty')}>{children}</div>
      </div>
    </div>
  );
}
