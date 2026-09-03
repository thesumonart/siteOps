import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ApiFieldError } from '@siteops/shared';
import type { ZodType } from 'zod';

import { ApiException } from '../errors/api-exception.js';

/**
 * Validates a request payload against a Zod schema.
 *
 * Zod is used instead of class-validator so the browser and the API enforce
 * literally the same rules: the schemas live in `@siteops/shared` and are
 * imported by both React Hook Form and this pipe. Running two validation
 * systems would let the two drift apart.
 *
 * The parsed — and therefore normalized and defaulted — value replaces the raw
 * input, so handlers never see unvalidated data.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields: ApiFieldError[] = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || '_',
        message: issue.message,
      }));
      throw ApiException.validation('Some fields need attention.', fields);
    }

    return result.data;
  }
}

/** Convenience factory: `@Body(zodBody(createWebsiteSchema))`. */
export function zodBody<TOutput>(schema: ZodType<TOutput>): ZodValidationPipe<TOutput> {
  return new ZodValidationPipe(schema);
}

/** Convenience factory for query strings: `@Query(zodQuery(listWebsitesQuerySchema))`. */
export function zodQuery<TOutput>(schema: ZodType<TOutput>): ZodValidationPipe<TOutput> {
  return new ZodValidationPipe(schema);
}
