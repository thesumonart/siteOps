import { Activity } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { SignOutButton } from '@/components/layout/sign-out-button';
import { fetchSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Dashboard',
};

/**
 * The authenticated shell.
 *
 * Rendered on the server so the session is resolved by the API before anything
 * reaches the browser — the middleware only checks that a cookie exists, which
 * is a routing hint rather than proof. Organizations and the monitoring
 * overview are added on top of this shell in the next phases.
 */
export default async function DashboardPage(): Promise<React.ReactElement> {
  // The incoming cookie has to be forwarded explicitly: a server component
  // makes its own request and does not inherit the browser's.
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');

  const user = await fetchSession(cookie ? { cookie } : undefined);

  if (!user) {
    redirect('/login?next=%2Fdashboard');
  }

  if (!user.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(user.email)}`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="size-5 text-primary" aria-hidden="true" />
            SiteOps
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Your account is confirmed. The next step is creating an organization to group the websites
          you look after.
        </p>
      </main>
    </div>
  );
}
