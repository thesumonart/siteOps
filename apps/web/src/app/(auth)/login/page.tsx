import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function LoginPage(): React.ReactElement {
  return (
    <>
      {/* The form reads `next` from the query string, so it needs its own
          boundary for the rest of the route to prerender. */}
      <Suspense
        fallback={<div className="text-center text-sm text-muted-foreground">Loading…</div>}
      >
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to SiteOps?{' '}
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
