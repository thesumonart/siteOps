import type { NextFunction, Request, Response } from 'express';

import { toApiError, type BetterAuthErrorBody } from './auth.error-mapping.js';
import { createLogger } from '../common/logging/logger.js';
import { type Auth } from './auth.instance.js';

const logger = createLogger('auth');

/**
 * Adapts Better Auth's Web `Request`/`Response` handler to Express, and
 * rewrites its error bodies into the SiteOps envelope.
 *
 * The library's native Node adapter would work, but it passes error responses
 * through in Better Auth's own `{ message, code }` shape. Those routes bypass
 * Nest's exception filter — they are mounted as raw middleware so the request
 * body reaches the handler unparsed — so without this the API would speak two
 * different error formats and every client would need both parsers.
 */

/** Rebuilds the absolute URL Better Auth needs from the Express request. */
function absoluteUrl(request: Request): string {
  const forwardedProto = request.get('x-forwarded-proto');
  const protocol = forwardedProto?.split(',')[0]?.trim() ?? request.protocol;
  const host = request.get('host') ?? 'localhost';
  return `${protocol}://${host}${request.originalUrl}`;
}

function readBody(request: Request): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}

export function createAuthHandler(auth: Auth) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const body = await readBody(request);

        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else {
            headers.set(name, value);
          }
        }

        const authResponse = await auth.handler(
          new Request(absoluteUrl(request), {
            method: request.method,
            headers,
            body: body && body.length > 0 ? body : undefined,
          }),
        );

        // Cookies arrive as repeated Set-Cookie headers and must not be joined
        // into one value, or the browser stores a single malformed cookie.
        for (const cookie of authResponse.headers.getSetCookie()) {
          response.append('Set-Cookie', cookie);
        }
        authResponse.headers.forEach((value, name) => {
          if (name.toLowerCase() === 'set-cookie') return;
          response.setHeader(name, value);
        });

        response.status(authResponse.status);

        const contentType = authResponse.headers.get('content-type') ?? '';
        const isJson = contentType.includes('application/json');
        const text = await authResponse.text();

        if (authResponse.status >= 400 && isJson) {
          const parsed = JSON.parse(text) as BetterAuthErrorBody;
          const envelope = toApiError(authResponse.status, parsed);
          logger.warn(
            {
              path: request.path,
              status: authResponse.status,
              code: envelope.error.code,
            },
            'auth.rejected',
          );
          response.json(envelope);
          return;
        }

        if (text.length === 0) {
          response.end();
          return;
        }
        response.send(text);
      } catch (error) {
        next(error);
      }
    })();
  };
}
