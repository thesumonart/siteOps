/**
 * Central registry of TanStack Query cache keys.
 *
 * Keys live in one place so an invalidation cannot silently miss a query
 * because a caller spelled the key differently.
 */
export const queryKeys = {
  session: ['session'] as const,
  members: (organizationId: string) => ['organizations', organizationId, 'members'] as const,
} as const;
