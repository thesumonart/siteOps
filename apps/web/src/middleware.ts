import { NextResponse, type NextRequest } from 'next/server';

/**
 * Server-side route protection.
 *
 * This is a *routing* decision, not an authorization one. It checks only that a
 * session cookie is present, so a signed-out visitor is sent to sign in instead
 * of watching a dashboard flash and then fail. It deliberately does not
 * validate the session: every API request is authorized by the API itself,
 * which is the only place that can be trusted.
 *
 * Doing a real session lookup here would put a network round trip on every
 * navigation and still would not be the security boundary.
 */

/** Matches Better Auth's cookie, including the `__Secure-` production prefix. */
const SESSION_COOKIE_PATTERN = /^(?:__Secure-)?siteops\.session_token$/;

const SIGNED_OUT_ONLY = ['/login', '/register', '/forgot-password'];

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => SESSION_COOKIE_PATTERN.test(cookie.name));
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const signedIn = hasSessionCookie(request);

  if (pathname.startsWith('/dashboard') && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserved so the person lands where they were headed. `next` is only ever
    // honoured as a same-site path; see the sign-in form.
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && SIGNED_OUT_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/forgot-password'],
};
