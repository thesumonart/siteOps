import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { RequestContextMiddleware } from './common/logging/request-context.middleware.js';
import { RateLimitGuard } from './common/rate-limit/index.js';
import { DatabaseModule } from './database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [DatabaseModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    /**
     * Rate limiting runs ahead of anything else so an unauthenticated flood is
     * rejected before it reaches authentication or the database.
     */
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat');
  }
}
