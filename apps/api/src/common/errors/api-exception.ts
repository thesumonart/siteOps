import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiFieldError } from '@siteops/shared';

/**
 * The only exception type application code should throw.
 *
 * Carrying a machine-readable {@link ApiErrorCode} means clients branch on a
 * stable value rather than on prose, and it keeps every failure response in the
 * documented envelope.
 */
export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly fields?: readonly ApiFieldError[];

  constructor(
    code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    fields?: readonly ApiFieldError[],
  ) {
    super({ code, message }, status);
    this.code = code;
    this.fields = fields;
  }

  static badRequest(code: ApiErrorCode, message: string): ApiException {
    return new ApiException(code, message, HttpStatus.BAD_REQUEST);
  }

  static validation(message: string, fields: readonly ApiFieldError[]): ApiException {
    return new ApiException('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, fields);
  }

  static unauthenticated(message = 'You must be signed in to do that.'): ApiException {
    return new ApiException('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(
    code: Extract<ApiErrorCode, 'FORBIDDEN' | 'NOT_A_MEMBER' | 'INSUFFICIENT_ROLE'> = 'FORBIDDEN',
    message = 'You do not have permission to do that.',
  ): ApiException {
    return new ApiException(code, message, HttpStatus.FORBIDDEN);
  }

  /**
   * Used for resources that exist but belong to another tenant as well as for
   * resources that do not exist. Distinguishing the two would let an attacker
   * enumerate identifiers across organizations.
   */
  static notFound(code: ApiErrorCode, message: string): ApiException {
    return new ApiException(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ApiErrorCode, message: string): ApiException {
    return new ApiException(code, message, HttpStatus.CONFLICT);
  }

  static rateLimited(message = 'Too many requests. Try again shortly.'): ApiException {
    return new ApiException('RATE_LIMITED', message, HttpStatus.TOO_MANY_REQUESTS);
  }

  static planLimit(message: string): ApiException {
    return new ApiException('PLAN_LIMIT_REACHED', message, HttpStatus.FORBIDDEN);
  }
}
