import { Module } from '@nestjs/common';

import { WebsiteController } from './website.controller.js';
import { WebsiteRepository } from './website.repository.js';
import { WebsiteService } from './website.service.js';

@Module({
  controllers: [WebsiteController],
  providers: [WebsiteRepository, WebsiteService],
  exports: [WebsiteService, WebsiteRepository],
})
export class WebsiteModule {}
