import type { Metadata } from 'next';
import { Suspense } from 'react';

import { VerifyEmailNotice } from './verify-email-notice';

export const metadata: Metadata = {
  title: 'Confirm your email',
};

export default function VerifyEmailPage(): React.ReactElement {
  return (
    // useSearchParams needs a Suspense boundary so the rest of the route can
    // still be prerendered.
    <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading…</div>}>
      <VerifyEmailNotice />
    </Suspense>
  );
}
