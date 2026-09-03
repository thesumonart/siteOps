'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api-client';

/**
 * Application-wide client providers.
 *
 * The QueryClient is created inside state rather than at module scope so each
 * request gets its own cache during server rendering — a module-level client
 * would leak one user's data into another user's render.
 */
export function Providers({ children }: { readonly children: ReactNode }): React.ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Retrying a rejected request cannot fix authorization, a missing
              // resource or bad input — it just delays the error state.
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
