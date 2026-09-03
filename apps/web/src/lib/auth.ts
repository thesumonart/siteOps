import type { SessionDto } from '@siteops/shared';

import { apiRequest } from './api-client';

/**
 * Authentication calls against the SiteOps API.
 *
 * Better Auth's own browser client is deliberately not used: the API wraps
 * every response — including the auth routes — in the SiteOps envelope, so one
 * client and one error type cover the whole app. The session itself lives in an
 * HttpOnly cookie the browser manages; nothing here touches a token.
 */

export interface SignUpInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

interface AuthUserPayload {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export async function signUp(input: SignUpInput): Promise<AuthUserPayload> {
  const result = await apiRequest<{ user: AuthUserPayload }>('/api/auth/sign-up/email', {
    method: 'POST',
    body: input,
  });
  return result.user;
}

export async function signIn(input: SignInInput): Promise<AuthUserPayload> {
  const result = await apiRequest<{ user: AuthUserPayload }>('/api/auth/sign-in/email', {
    method: 'POST',
    body: input,
  });
  return result.user;
}

export async function signOut(): Promise<void> {
  await apiRequest('/api/auth/sign-out', { method: 'POST' });
}

/**
 * Always resolves, even for an unknown address: the response must not reveal
 * whether an account exists.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/api/auth/request-password-reset', {
    method: 'POST',
    body: { email },
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
}

export async function resendVerificationEmail(email: string): Promise<void> {
  await apiRequest('/api/auth/send-verification-email', {
    method: 'POST',
    body: { email },
  });
}

/**
 * The signed-in user with their organizations, or null.
 *
 * Never throws for "signed out": the endpoint answers with a null user, so a
 * first paint can distinguish that from a failed request.
 */
export async function fetchSession(headers?: Record<string, string>): Promise<SessionDto | null> {
  const result = await apiRequest<SessionDto | { user: null }>('/api/session', {
    ...(headers ? { headers } : {}),
  });
  return result.user === null ? null : result;
}
