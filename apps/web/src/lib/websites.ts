import type {
  CreateWebsiteInput,
  ListWebsitesQuery,
  OffsetPaginatedResult,
  UpdateWebsiteInput,
  WebsiteDto,
  WebsiteSummaryDto,
} from '@siteops/shared';

import { apiRequest } from './api-client';

/** Website management calls. Every one is authorized and tenant-scoped server-side. */

export async function fetchWebsites(
  query: Partial<ListWebsitesQuery> = {},
): Promise<OffsetPaginatedResult<WebsiteSummaryDto>> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  // The list carries 24-hour uptime and response-time rollups per row; the
  // single-website endpoint does not, because its page loads richer stats.
  return apiRequest<OffsetPaginatedResult<WebsiteSummaryDto>>(`/api/websites${suffix}`);
}

export async function fetchWebsite(websiteId: string): Promise<WebsiteDto> {
  return apiRequest<WebsiteDto>(`/api/websites/${websiteId}`);
}

export async function createWebsite(input: CreateWebsiteInput): Promise<WebsiteDto> {
  return apiRequest<WebsiteDto>('/api/websites', { method: 'POST', body: input });
}

export async function updateWebsite(
  websiteId: string,
  input: UpdateWebsiteInput,
): Promise<WebsiteDto> {
  return apiRequest<WebsiteDto>(`/api/websites/${websiteId}`, { method: 'PATCH', body: input });
}

export async function setWebsiteMonitoring(
  websiteId: string,
  enabled: boolean,
): Promise<WebsiteDto> {
  return apiRequest<WebsiteDto>(`/api/websites/${websiteId}/${enabled ? 'resume' : 'pause'}`, {
    method: 'POST',
  });
}

export async function deleteWebsite(websiteId: string): Promise<void> {
  await apiRequest(`/api/websites/${websiteId}`, { method: 'DELETE' });
}
