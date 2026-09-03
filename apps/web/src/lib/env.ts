import { z } from 'zod';

/**
 * Browser-visible configuration.
 *
 * Only `NEXT_PUBLIC_*` values may appear here — everything in this module is
 * inlined into the client bundle at build time. A server secret placed here
 * would be published to every visitor.
 *
 * The variables are read as whole literals rather than through a loop, because
 * Next replaces `process.env.NEXT_PUBLIC_X` textually and a dynamic lookup
 * would silently resolve to undefined in the browser.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid web environment configuration:\n${details}`);
}

export const env = parsed.data;
