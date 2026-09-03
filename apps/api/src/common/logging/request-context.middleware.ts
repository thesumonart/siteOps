import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { logger } from './logger';

/** Client-supplied ids are echoed only if they look like ids, never raw. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Assigns every request a correlation id and logs its completion.
 *
 * The id is echoed in `X-Request-Id` so a user-reported failure can be traced
 * to the exact log line, and it is attached to `req.id` for the exception
 * filter. Request bodies are never logged: they carry passwords and tokens.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.header('x-request-id');
    const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();

    request.id = requestId;
    response.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      // Failures are logged in detail by AllExceptionsFilter; logging them here
      // as well would double every error line.
      if (response.statusCode >= 400) return;

      logger.info(
        {
          requestId,
          method: request.method,
          // Query strings can carry verification and reset tokens, so only
          // the path is logged.
          path: request.originalUrl.split('?')[0] ?? request.originalUrl,
          status: response.statusCode,
          durationMs: Math.round(durationMs),
        },
        'request.completed',
      );
    });

    next();
  }
}
