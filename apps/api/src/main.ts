import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiErrorResponse } from '@siteops/shared';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { createAuthHandler } from './auth/auth.handler.js';
import { AUTH_BASE_PATH, type Auth } from './auth/auth.instance.js';
import { authRateLimitMiddleware } from './auth/auth.rate-limit.js';
import { AUTH_INSTANCE } from './auth/auth.types.js';
import { createLogger } from './common/logging/logger.js';
import { DatabaseModule } from './database.module.js';
import { env, isProduction, trustedOrigins } from './config/env.js';

const logger = createLogger('bootstrap');

async function bootstrap(): Promise<void> {
  // Fail before the HTTP server binds if the database is unreachable, so the
  // platform never routes traffic to an API that cannot serve it.
  await DatabaseModule.connect();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Requests are logged by pino via the structured logger; Nest's own
    // console logger would duplicate them in a different format.
    logger: false,
    // Better Auth reads the raw request stream. Nest's body parser would
    // consume it first and leave every sign-in with an empty body, so parsing
    // is registered manually below — after the auth routes.
    bodyParser: false,
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

  /*
   * Order matters here.
   *
   * Better Auth is mounted before any body parser because its handler consumes
   * the raw stream. Its own rate limiting runs first, since Nest's guard never
   * sees these routes. JSON parsing is registered afterwards, so every Nest
   * controller still receives a parsed body.
   */
  const auth = app.get<Auth>(AUTH_INSTANCE);
  app.use(AUTH_BASE_PATH, authRateLimitMiddleware(), createAuthHandler(auth));

  // A monitoring payload is small; a generous limit only helps an attacker.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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
