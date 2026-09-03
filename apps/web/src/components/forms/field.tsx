import type * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FieldProps {
  readonly id: string;
  readonly label: string;
  /** Guidance shown before the user makes a mistake, not after. */
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/**
 * A labelled form field with its hint and error wired for assistive tech.
 *
 * The error sits next to the field rather than in a summary at the top, and is
 * referenced by `aria-describedby` so it is announced when focus lands on the
 * input.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: FieldProps): React.ReactElement {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-status-down">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Attributes every input inside a {@link Field} needs for accessibility. */
export function fieldAria(id: string, hasHint: boolean, error?: string) {
  const describedBy = [error ? `${id}-error` : null, hasHint && !error ? `${id}-hint` : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy.length > 0 ? describedBy : undefined,
  } as const;
}
