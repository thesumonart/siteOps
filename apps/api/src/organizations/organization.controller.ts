import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type OrganizationDto,
  type OrganizationMembershipDto,
  type UpdateOrganizationInput,
} from '@siteops/shared';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../common/rate-limit/index.js';
import { CurrentOrganization, RequirePermission } from './organization.decorators.js';
import { OrganizationService } from './organization.service.js';
import { type OrganizationContext } from './organization.types.js';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  /**
   * Organizations the caller belongs to.
   *
   * Scoped by the session rather than by any parameter, so there is nothing to
   * tamper with.
   */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<readonly OrganizationMembershipDto[]> {
    return this.organizations.listForUser(user.id);
  }

  /**
   * Creating an organization needs only a session — the caller becomes its
   * owner. Rate limited because it writes two documents and claims a slug.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, windowSeconds: 3600, scope: 'organization-create' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createOrganizationSchema)) input: CreateOrganizationInput,
  ): Promise<OrganizationMembershipDto> {
    return this.organizations.create(input, { id: user.id, name: user.name });
  }

  @Patch(':organizationId')
  @RequirePermission('organization:update')
  async update(
    @Param('organizationId') _organizationId: string,
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateOrganizationSchema)) input: UpdateOrganizationInput,
  ): Promise<OrganizationDto> {
    // The id is read from the guarded context, not from the path parameter:
    // the guard already proved membership for it.
    return this.organizations.update(organization.id, input, { id: user.id, name: user.name });
  }
}
