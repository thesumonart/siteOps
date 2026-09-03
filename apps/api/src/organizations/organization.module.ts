import { Global, Module } from '@nestjs/common';

import { InvitationController, MemberController } from './member.controller.js';
import { MemberRepository } from './member.repository.js';
import { MemberService } from './member.service.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationRepository } from './organization.repository.js';
import { OrganizationService } from './organization.service.js';

/**
 * Global because OrganizationGuard is registered application-wide and needs the
 * repository, and because every feature module scopes its queries by the
 * organization this module resolves.
 */
@Global()
@Module({
  controllers: [OrganizationController, MemberController, InvitationController],
  providers: [OrganizationRepository, OrganizationService, MemberRepository, MemberService],
  exports: [OrganizationRepository, OrganizationService, MemberService],
})
export class OrganizationModule {}
