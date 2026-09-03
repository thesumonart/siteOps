import type {
  CursorPaginatedResult,
  DashboardStatsDto,
  IncidentDto,
  ListIncidentsQuery,
  ListWebsiteChecksQuery,
  NotificationSettingsDto,
  StatsRange,
  UpdateNotificationPreferencesInput,
  UptimeBucketDto,
  UptimeStatsDto,
  WebsiteCheckDto,
} from '@siteops/shared';

import { apiRequest } from './api-client';

/**
 * Reads of recorded monitoring data.
 *
 * Everything returned here was measured by the worker. Nothing on these
 * screens is derived in the browser from anything other than what the API
 * actually recorded.
 */

export async function fetchDashboardStats(
  headers?: Record<string, string>,
): Promise<DashboardStatsDto> {
  return apiRequest<DashboardStatsDto>('/api/dashboard/stats', headers ? { headers } : {});
}

export async function fetchWebsiteStats(
  websiteId: string,
  range: StatsRange,
): Promise<UptimeStatsDto> {
  return apiRequest<UptimeStatsDto>(`/api/websites/${websiteId}/stats?range=${range}`);
}

export async function fetchWebsiteUptime(
  websiteId: string,
  range: StatsRange,
): Promise<readonly UptimeBucketDto[]> {
  return apiRequest<readonly UptimeBucketDto[]>(`/api/websites/${websiteId}/uptime?range=${range}`);
}

export async function fetchWebsiteChecks(
  websiteId: string,
  query: Partial<ListWebsiteChecksQuery> = {},
): Promise<CursorPaginatedResult<WebsiteCheckDto>> {
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.status) params.set('status', query.status);

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiRequest<CursorPaginatedResult<WebsiteCheckDto>>(
    `/api/websites/${websiteId}/checks${suffix}`,
  );
}

export async function fetchIncidents(
  query: Partial<ListIncidentsQuery> = {},
): Promise<CursorPaginatedResult<IncidentDto>> {
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.status) params.set('status', query.status);
  if (query.websiteId) params.set('websiteId', query.websiteId);

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiRequest<CursorPaginatedResult<IncidentDto>>(`/api/incidents${suffix}`);
}

export async function fetchNotificationSettings(): Promise<NotificationSettingsDto> {
  return apiRequest<NotificationSettingsDto>('/api/notification-settings');
}

export async function updateNotificationSettings(
  input: UpdateNotificationPreferencesInput,
): Promise<NotificationSettingsDto> {
  return apiRequest<NotificationSettingsDto>('/api/notification-settings', {
    method: 'PATCH',
    body: input,
  });
}
