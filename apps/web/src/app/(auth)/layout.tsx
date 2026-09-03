import { Activity } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

/**
 * Shell for the signed-out pages.
 *
 * A single narrow column: these pages have exactly one job each, and anything
 * else on screen is a distraction from completing it.
 */
export default function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm font-semibold tracking-tight"
          >
            <Activity className="size-5 text-primary" aria-hidden="true" />
            SiteOps
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
