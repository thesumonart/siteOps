import { createHmac } from 'node:crypto';

import { E2E_AUTH_SECRET } from '../../playwright.config';

/**
 * Mints the email-verification token for an address.
 *
 * Better Auth does not store this token anywhere — it is a self-contained
 * HS256 JWT over `{ email }`, signed with `AUTH_SECRET` — so there is nothing
 * in the database for a test to read, and no mail provider in a test run to
 * deliver the link.
 *
 * Signing it here with the same secret produces the *exact* token the email
 * would have carried, so the test can follow the real link and the real
 * `/verify-email` route runs: signature check, expiry, the user update, the
 * redirect and the automatic sign-in that follows. The alternative — setting
 * `emailVerified` directly in the database — would skip every one of those.
 *
 * This mirrors `signJWT` in `better-auth/crypto`. It is reimplemented rather
 * than imported so the web app does not take a dependency on Better Auth; the
 * one API client is deliberate (see CLAUDE.md).
 */
export function verificationTokenFor(email: string, expiresInSeconds = 3600): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    email: email.toLowerCase(),
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', E2E_AUTH_SECRET).update(signingInput).digest('base64url');

  return `${signingInput}.${signature}`;
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
