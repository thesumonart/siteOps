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
} from '@nestjs/common';
import {
  acceptInvitationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  type AcceptInvitationInput,
  type InviteMemberInput,
  type OrganizationMemberDto,
  type UpdateMemberRoleInput,
} from '@siteops/shared';

import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../common/rate-limit/index.js';
import { MemberService, type MembersViewDto, type PendingInvitationDto } from './member.service.js';
import { CurrentOrganization, RequirePermission } from './organization.decorators.js';
import { type OrganizationContext } from './organization.types.js';

@Controller('organizations/:organizationId/members')
export class MemberController {
  constructor(private readonly members: MemberService) {}

  @Get()
  @RequirePermission('member:read')
  async list(@CurrentOrganization() organization: OrganizationContext): Promise<MembersViewDto> {
    return this.members.list(organization);
  }

  /** Sending an invitation sends an email, so it carries a tighter budget. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('member:invite')
  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'member-invite' })
  async invite(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(inviteMemberSchema)) input: InviteMemberInput,
  ): Promise<PendingInvitationDto> {
    return this.members.invite(organization, input, {
      id: user.id,
      name: user.name,
      role: organization.role,
    });
  }

  @Patch(':memberId')
  @RequirePermission('member:update_role')
  async updateRole(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
    @Body(zodBody(updateMemberRoleSchema)) input: UpdateMemberRoleInput,
  ): Promise<OrganizationMemberDto> {
    return this.members.updateRole(organization, memberId, input.role, {
      id: user.id,
      name: user.name,
      role: organization.role,
    });
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('member:remove')
  async remove(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    await this.members.remove(organization, memberId, {
      id: user.id,
      name: user.name,
      role: organization.role,
    });
  }

  @Delete('invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('member:invite')
  async revokeInvitation(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    await this.members.revokeInvitation(organization, invitationId, {
      id: user.id,
      name: user.name,
      role: organization.role,
    });
  }
}

/**
 * Accepting an invitation is deliberately outside the organization-scoped
 * routes: the caller is not a member yet, so `OrganizationGuard` would reject
 * them. Authorization comes from holding the emailed token *and* being signed
 * in as the address it was sent to.
 */
@Controller('invitations')
export class InvitationController {
  constructor(private readonly members: MemberService) {}

  @Post('accept')
  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'invitation-accept' })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(acceptInvitationSchema)) input: AcceptInvitationInput,
  ): Promise<{ readonly organizationId: string }> {
    return this.members.accept(input.token, {
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }
}
