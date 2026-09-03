import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  listIncidentsQuerySchema,
  listWebsiteChecksQuerySchema,
  updateNotificationPreferencesSchema,
  websiteStatsQuerySchema,
  type CursorPaginatedResult,
  type DashboardStatsDto,
  type IncidentDto,
  type ListIncidentsQuery,
  type ListWebsiteChecksQuery,
  type NotificationSettingsDto,
  type UpdateNotificationPreferencesInput,
  type UptimeBucketDto,
  type UptimeStatsDto,
  type WebsiteCheckDto,
  type WebsiteStatsQuery,
} from '@siteops/shared';

import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { zodBody, zodQuery } from '../common/pipes/zod-validation.pipe.js';
import {
  CurrentOrganization,
  RequirePermission,
} from '../organizations/organization.decorators.js';
import { type OrganizationContext } from '../organizations/organization.types.js';
import { IncidentService } from './incident.service.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { StatsService } from './stats.service.js';

/**
 * Reads over what the worker has recorded.
 *
 * Every route declares a permission, so `OrganizationGuard` resolves and
 * verifies membership before the handler runs, and the organization comes from
 * the guarded context rather than from any parameter the caller controls.
 */
@Controller('incidents')
export class IncidentController {
  constructor(private readonly incidents: IncidentService) {}

  @Get()
  @RequirePermission('incident:read')
  async list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query(zodQuery(listIncidentsQuerySchema)) query: ListIncidentsQuery,
  ): Promise<CursorPaginatedResult<IncidentDto>> {
    return this.incidents.list(organization, query);
  }

  @Get(':incidentId')
  @RequirePermission('incident:read')
  async getById(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentDto> {
    return this.incidents.getById(organization, incidentId);
  }
}

/**
 * Monitoring history for one website.
 *
 * Shares the `websites` prefix with `WebsiteController` — the routes are
 * distinct suffixes, and keeping them here means the website module does not
 * have to depend on the stats service.
 */
@Controller('websites')
export class WebsiteMonitoringController {
  constructor(private readonly service: StatsService) {}

  @Get(':websiteId/stats')
  @RequirePermission('monitoring:read')
  async stats(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('websiteId') websiteId: string,
    @Query(zodQuery(websiteStatsQuerySchema)) query: WebsiteStatsQuery,
  ): Promise<UptimeStatsDto> {
    return this.service.websiteStats(organization, websiteId, query.range);
  }

  @Get(':websiteId/uptime')
  @RequirePermission('monitoring:read')
  async uptime(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('websiteId') websiteId: string,
    @Query(zodQuery(websiteStatsQuerySchema)) query: WebsiteStatsQuery,
  ): Promise<readonly UptimeBucketDto[]> {
    return this.service.websiteBuckets(organization, websiteId, query.range);
  }

  @Get(':websiteId/checks')
  @RequirePermission('monitoring:read')
  async checks(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('websiteId') websiteId: string,
    @Query(zodQuery(listWebsiteChecksQuerySchema)) query: ListWebsiteChecksQuery,
  ): Promise<CursorPaginatedResult<WebsiteCheckDto>> {
    return this.service.websiteChecks(organization, websiteId, query);
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats')
  @RequirePermission('monitoring:read')
  async summary(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<DashboardStatsDto> {
    return this.stats.dashboardStats(organization);
  }
}

/**
 * Alert preferences for the signed-in user.
 *
 * The user is taken from the session, never from a parameter: a member must
 * not be able to change what a colleague is alerted about, and there is no
 * route shape here that would let them try.
 */
@Controller('notification-settings')
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  @RequirePermission('notification:read')
  async get(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationSettingsDto> {
    return this.settings.get(organization, user.id);
  }

  @Patch()
  @RequirePermission('notification:update')
  async update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateNotificationPreferencesSchema))
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationSettingsDto> {
    return this.settings.update(organization, user.id, input);
  }
}
