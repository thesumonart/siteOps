import { Global, Module } from '@nestjs/common';

import { EmailService } from './email.service.js';

/**
 * Global so the auth layer and, later, the notification service can inject it
 * without each feature module re-importing the provider.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
