import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createWebsiteSchema,
  listWebsitesQuerySchema,
  updateWebsiteSchema,
  type CreateWebsiteInput,
  type ListWebsitesQuery,
  type OffsetPaginatedResult,
  type UpdateWebsiteInput,
  type WebsiteDto,
} from '@siteops/shared';

import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { zodBody, zodQuery } from '../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../common/rate-limit/index.js';
import {
  CurrentOrganization,
  RequirePermission,
} from '../organizations/organization.decorators.js';
import { type OrganizationContext } from '../organizations/organization.types.js';
import { WebsiteService } from './website.service.js';

/**
 * Every route declares a permission, so `OrganizationGuard` resolves and
 * verifies membership before the handler runs. The organization is taken from
 * the guarded context, never from a parameter.
 */
@Controller('websites')
export class WebsiteController {
  constructor(private readonly websites: WebsiteService) {}

  @Get()
  @RequirePermission('website:read')
  async list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query(zodQuery(listWebsitesQuerySchema)) query: ListWebsitesQuery,
  ): Promise<OffsetPaginatedResult<WebsiteDto>> {
    return this.websites.list(organization, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('website:create')
  @RateLimit({ limit: 60, windowSeconds: 3600, scope: 'website-create' })
  async create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createWebsiteSchema)) input: CreateWebsiteInput,
  ): Promise<WebsiteDto> {
    return this.websites.create(organization, input, { id: user.id, name: user.name });
  }

  @Get(':websiteId')
  @RequirePermission('website:read')
  async getById(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('websiteId') websiteId: string,
  ): Promise<WebsiteDto> {
    return this.websites.getById(organization, websiteId);
  }

  @Patch(':websiteId')
  @RequirePermission('website:update')
  async update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('websiteId') websiteId: string,
    @Body(zodBody(updateWebsiteSchema)) input: UpdateWebsiteInput,
  ): Promise<WebsiteDto> {
    return this.websites.update(organization, websiteId, input, {
      id: user.id,
      name: user.name,
    });
  }

  @Post(':websiteId/pause')
  @RequirePermission('monitoring:toggle')
  async pause(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('websiteId') websiteId: string,
  ): Promise<WebsiteDto> {
    return this.websites.setMonitoring(organization, websiteId, false, {
      id: user.id,
      name: user.name,
    });
  }

  @Post(':websiteId/resume')
  @RequirePermission('monitoring:toggle')
  async resume(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('websiteId') websiteId: string,
  ): Promise<WebsiteDto> {
    return this.websites.setMonitoring(organization, websiteId, true, {
      id: user.id,
      name: user.name,
    });
  }

  @Delete(':websiteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('website:delete')
  async remove(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('websiteId') websiteId: string,
  ): Promise<void> {
    await this.websites.delete(organization, websiteId, { id: user.id, name: user.name });
  }
}
