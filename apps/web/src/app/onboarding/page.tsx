import { Activity } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { fetchSession } from '@/lib/auth';
import { CreateOrganizationForm } from './create-organization-form';

export const metadata: Metadata = {
  title: 'Create your organization',
};

/**
 * The step between confirming an email and using the product.
 *
 * Reachable at any time from the organization switcher, so it is not gated on
 * having zero organizations — only an unauthenticated visitor is turned away.
 */
export default async function OnboardingPage(): Promise<React.ReactElement> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const session = await fetchSession(cookie ? { cookie } : undefined);

  if (!session) redirect('/login?next=%2Fonboarding');
  if (!session.user.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="size-5 text-primary" aria-hidden="true" />
            SiteOps
          </span>
          {session.memberships.length > 0 ? (
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to dashboard
            </Link>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-sm">
          <CreateOrganizationForm />
        </div>
      </main>
    </div>
  );
}
