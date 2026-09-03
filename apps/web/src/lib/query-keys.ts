/**
 * Central registry of TanStack Query cache keys.
 *
 * Keys live in one place so an invalidation cannot silently miss a query
 * because a caller spelled the key differently.
 */
export const queryKeys = {
  session: ['session'] as const,
  members: (organizationId: string) => ['organizations', organizationId, 'members'] as const,
  websites: (organizationId: string, filters?: Record<string, unknown>) =>
    ['organizations', organizationId, 'websites', filters ?? {}] as const,
  website: (organizationId: string, websiteId: string) =>
    ['organizations', organizationId, 'websites', websiteId] as const,
  dashboardStats: (organizationId: string) =>
    ['organizations', organizationId, 'dashboard-stats'] as const,
  websiteStats: (organizationId: string, websiteId: string, range: string) =>
    ['organizations', organizationId, 'websites', websiteId, 'stats', range] as const,
  websiteUptime: (organizationId: string, websiteId: string, range: string) =>
    ['organizations', organizationId, 'websites', websiteId, 'uptime', range] as const,
  websiteChecks: (organizationId: string, websiteId: string, filters?: Record<string, unknown>) =>
    ['organizations', organizationId, 'websites', websiteId, 'checks', filters ?? {}] as const,
  incidents: (organizationId: string, filters?: Record<string, unknown>) =>
    ['organizations', organizationId, 'incidents', filters ?? {}] as const,
  notificationSettings: (organizationId: string) =>
    ['organizations', organizationId, 'notification-settings'] as const,
} as const;
