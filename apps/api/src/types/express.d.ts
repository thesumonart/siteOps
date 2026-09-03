/**
 * Express request augmentations owned by SiteOps middleware.
 *
 * Declared centrally so a handler cannot read a field that nothing sets.
 */
declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by RequestContextMiddleware. */
      id: string;
    }
  }
}

export {};
