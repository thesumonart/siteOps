'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { resendVerificationEmail } from '@/lib/auth';

/**
 * Shown straight after sign-up, and when an unverified account tries to sign in.
 *
 * The address comes from the query string purely to address the copy and
 * pre-fill the resend request. It is never trusted: the server sends the email
 * to whatever address the account actually holds.
 */
export function VerifyEmailNotice(): React.ReactElement {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const mutation = useMutation({
    mutationFn: () => resendVerificationEmail(email),
  });

  return (
    <div className="text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        <MailCheck className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">Confirm your email</h1>
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        {email.length > 0 ? (
          <>
            We sent a confirmation link to{' '}
            <span className="font-medium text-foreground">{email}</span>. Open it to finish setting
            up your account.
          </>
        ) : (
          'We sent you a confirmation link. Open it to finish setting up your account.'
        )}
      </p>

      <div className="mt-6 grid gap-3 text-left">
        {mutation.isSuccess ? (
          <Alert variant="success">
            Sent. If an account exists for that address, a new link is on its way.
          </Alert>
        ) : null}
        {mutation.error ? (
          <Alert variant="error">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Could not resend the email. Try again shortly.'}
          </Alert>
        ) : null}

        {email.length > 0 ? (
          <Button
            variant="outline"
            onClick={() => {
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              'Resend confirmation email'
            )}
          </Button>
        ) : null}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
