import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { ApiSuccessResponse } from '@siteops/shared';
import { map, type Observable } from 'rxjs';

/**
 * Wraps every successful controller result in `{ success: true, data }`.
 *
 * Controllers return plain domain objects; the envelope is applied in one
 * place so a handler cannot accidentally ship a differently-shaped success
 * response. Failures are shaped by {@link AllExceptionsFilter}.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    return next.handle().pipe(map((data) => ({ success: true as const, data })));
  }
}
