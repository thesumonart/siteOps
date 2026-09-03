'use client';

import type { UserDto } from '@siteops/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchSession } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';

/**
 * The signed-in user, or null.
 *
 * This is a convenience for client components; it is never the access control.
 * Routes are protected server-side in `middleware.ts` and every API call is
 * authorized by the server regardless of what the browser believes.
 */
export function useSession(): UseQueryResult<UserDto | null, Error> {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => fetchSession(),
    // The session rarely changes within a visit, and a stale read here only
    // affects presentation.
    staleTime: 60_000,
    retry: false,
  });
}
