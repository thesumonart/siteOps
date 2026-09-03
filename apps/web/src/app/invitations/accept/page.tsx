import { Activity } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AcceptInvitation } from './accept-invitation';

export const metadata: Metadata = {
  title: 'Accept invitation',
};

export default function AcceptInvitationPage(): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="size-5 text-primary" aria-hidden="true" />
            SiteOps
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-sm">
          <Suspense
            fallback={<div className="text-center text-sm text-muted-foreground">Loading…</div>}
          >
            <AcceptInvitation />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
