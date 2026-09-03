import { Global, Module } from '@nestjs/common';

import { EmailService } from '../email/email.service.js';
import { createAuth, type Auth } from './auth.instance.js';
import { AuthController } from './auth.controller.js';
import { AUTH_INSTANCE } from './auth.types.js';

/**
 * Owns the Better Auth instance.
 *
 * Constructed by a factory rather than at module load, because the adapter
 * needs a live MongoDB handle — `DatabaseModule.connect()` runs before the Nest
 * application is created, so the connection is open by the time this resolves.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_INSTANCE,
      inject: [EmailService],
      useFactory: (emailService: EmailService): Auth => createAuth(emailService),
    },
  ],
  exports: [AUTH_INSTANCE],
})
export class AuthModule {}
