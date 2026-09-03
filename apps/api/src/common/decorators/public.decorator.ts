import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'siteops:isPublic';

/**
 * Marks a route as reachable without a session.
 *
 * Authentication is applied globally, so access is denied by default and every
 * exception has to be declared explicitly at the handler. Forgetting this
 * decorator makes a route private, which is the safe direction to fail.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
