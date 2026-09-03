import type * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>): React.ReactElement {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors duration-200 outline-none',
        'selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        // `aria-invalid` is set by the form layer, so the ring follows the
        // accessible state rather than a separate visual-only prop.
        'aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
