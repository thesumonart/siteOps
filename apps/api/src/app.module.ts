import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { RequestContextMiddleware } from './common/logging/request-context.middleware.js';
import { RateLimitGuard } from './common/rate-limit/index.js';
import { DatabaseModule } from './database.module.js';
import { EmailModule } from './email/email.module.js';
import { HealthModule } from './health/health.module.js';
import { OrganizationGuard } from './organizations/organization.guard.js';
import { OrganizationModule } from './organizations/organization.module.js';

@Module({
  imports: [DatabaseModule, EmailModule, AuditModule, AuthModule, OrganizationModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    /**
     * Rate limiting runs ahead of anything else so an unauthenticated flood is
     * rejected before it reaches authentication or the database.
     */
    { provide: APP_GUARD, useClass: RateLimitGuard },
    /**
     * Registered after the rate limiter so a flood is rejected before it
     * reaches session lookup. Access is denied by default: every route without
     * `@Public()` requires a verified session.
     */
    { provide: APP_GUARD, useClass: AuthGuard },
    /**
     * Last in the chain: it needs an authenticated user before it can resolve
     * membership. Routes that declare no permission pass straight through.
     */
    { provide: APP_GUARD, useClass: OrganizationGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat');
  }
}
