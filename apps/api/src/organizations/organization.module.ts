import { Global, Module } from '@nestjs/common';

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
  controllers: [OrganizationController],
  providers: [OrganizationRepository, OrganizationService],
  exports: [OrganizationRepository, OrganizationService],
})
export class OrganizationModule {}
