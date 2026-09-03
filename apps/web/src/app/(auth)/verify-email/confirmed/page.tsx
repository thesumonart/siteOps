import { CircleCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Email confirmed',
};

/**
 * Where the confirmation link lands after the API has verified the token.
 *
 * Verification also signs the account in, so this is the handover into the
 * product rather than a dead end.
 */
export default function EmailConfirmedPage(): React.ReactElement {
  return (
    <div className="text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-status-operational-subtle">
        <CircleCheck className="size-5 text-status-operational" aria-hidden="true" />
      </div>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">Email confirmed</h1>
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        Your account is ready. Add your first website and monitoring starts straight away.
      </p>

      <Button asChild className="mt-6 w-full">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}
