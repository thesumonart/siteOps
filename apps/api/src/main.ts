import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiErrorResponse } from '@siteops/shared';
import type { Request, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { createLogger } from './common/logging/logger';
import { DatabaseModule } from './database.module';
import { env, isProduction, trustedOrigins } from './config/env';

const logger = createLogger('bootstrap');

async function bootstrap(): Promise<void> {
  // Fail before the HTTP server binds if the database is unreachable, so the
  // platform never routes traffic to an API that cannot serve it.
  await DatabaseModule.connect();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Requests are logged by pino via the structured logger; Nest's own
    // console logger would duplicate them in a different format.
    logger: false,
    bodyParser: true,
  });

  app.enableShutdownHooks();

  if (env.TRUST_PROXY) {
    // Required for correct client IPs — and therefore correct rate limiting —
    // behind a platform load balancer. Enabling it without a proxy in front
    // would let a client spoof its address via X-Forwarded-For.
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      // This API serves JSON only; a restrictive CSP costs nothing here and
      // hardens any error page a browser might render.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.enableCors({
    // An explicit allowlist, never a reflected origin: credentials are sent
    // with these requests, so a wildcard would expose sessions to any site.
    origin: [...trustedOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });

  // Routes are registered during init. Registering the fallback afterwards puts
  // it last, so an unmatched path returns the documented JSON envelope instead
  // of Express's default HTML error page.
  await app.init();
  app.use((_request: Request, response: Response) => {
    response.status(HttpStatus.NOT_FOUND).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found.' },
    } satisfies ApiErrorResponse);
  });

  const server = await app.listen(env.PORT, '0.0.0.0');
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;

  logger.info({ port: env.PORT, environment: env.NODE_ENV, trustedOrigins }, 'api.started');
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'api.bootstrap_failed');
  process.exitCode = 1;
});
