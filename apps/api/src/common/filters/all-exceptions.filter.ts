import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorCode, ApiErrorResponse } from '@siteops/shared';
import type { Request, Response } from 'express';

import { ApiException } from '../errors/api-exception';
import { logger } from '../logging/logger';

/**
 * Framework-raised HTTP errors carry no SiteOps error code, so status is mapped
 * to the closest documented one. Anything unmapped becomes INTERNAL_ERROR,
 * which never reveals what actually failed.
 */
const CODE_BY_STATUS: Readonly<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const MESSAGE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'The request could not be processed.',
  [HttpStatus.UNAUTHORIZED]: 'You must be signed in to do that.',
  [HttpStatus.FORBIDDEN]: 'You do not have permission to do that.',
  [HttpStatus.NOT_FOUND]: 'Not found.',
  [HttpStatus.CONFLICT]: 'That conflicts with something that already exists.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests. Try again shortly.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable.',
};

/**
 * Terminal error handler.
 *
 * Every failure leaves the API in the documented envelope, and nothing about
 * the internals leaves the process: stack traces, driver errors, file paths and
 * connection strings are logged server-side and replaced with a generic message
 * in the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const { status, body, logLevel } = this.describe(exception);

    const requestId = request.id;

    logger[logLevel](
      {
        requestId,
        method: request.method,
        path: request.originalUrl,
        status,
        code: body.error.code,
        // The full error is logged only server-side.
        err: exception instanceof Error ? exception : new Error(String(exception)),
      },
      'request.failed',
    );

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    body: ApiErrorResponse;
    logLevel: 'warn' | 'error';
  } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.fields ? { fields: exception.fields } : {}),
          },
        },
        // Expected, client-caused failures are not operational incidents.
        logLevel: exception.getStatus() >= 500 ? 'error' : 'warn',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          success: false,
          error: {
            code: this.codeForStatus(status),
            message: this.messageForStatus(status),
          },
        },
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong. Please try again.',
        },
      },
      logLevel: 'error',
    };
  }

  private codeForStatus(status: number): ApiErrorCode {
    return CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR';
  }

  private messageForStatus(status: number): string {
    return MESSAGE_BY_STATUS[status] ?? 'Something went wrong. Please try again.';
  }
}
