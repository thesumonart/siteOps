'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Loader2, MailWarning } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { writeActiveOrganizationCookie } from '@/lib/active-organization';
import { ApiError } from '@/lib/api-client';
import { acceptInvitation } from '@/lib/organizations';
import { queryKeys } from '@/lib/query-keys';

/**
 * Redeems an invitation link.
 *
 * Acceptance is attempted automatically on arrival, because the person already
 * expressed intent by clicking the link in their email — asking them to confirm
 * again would be a pointless extra step. The API still requires them to be
 * signed in as the invited address.
 */
export function AcceptInvitation(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const attempted = useRef(false);

  const mutation = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: async (result) => {
      writeActiveOrganizationCookie(result.organizationId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      router.replace('/dashboard');
      router.refresh();
    },
  });

  const { mutate } = mutation;
  useEffect(() => {
    // React runs effects twice in development; the ref keeps a single-use token
    // from being spent on a duplicate request.
    if (token.length === 0 || attempted.current) return;
    attempted.current = true;
    mutate();
  }, [token, mutate]);

  if (token.length === 0) {
    return (
      <Outcome
        icon={<MailWarning className="size-5 text-status-down" aria-hidden="true" />}
        title="This link is incomplete"
      >
        <Alert variant="error">
          The invitation link is missing its token. Open the link directly from the email you were
          sent.
        </Alert>
      </Outcome>
    );
  }

  if (mutation.isError) {
    const error = mutation.error;
    const needsSignIn = error instanceof ApiError && error.code === 'UNAUTHENTICATED';
    const wrongAccount = error instanceof ApiError && error.code === 'FORBIDDEN';

    return (
      <Outcome
        icon={<MailWarning className="size-5 text-status-down" aria-hidden="true" />}
        title="Could not accept this invitation"
      >
        <Alert variant="error">
          {error instanceof ApiError ? error.message : 'Something went wrong. Try again shortly.'}
        </Alert>

        {needsSignIn || wrongAccount ? (
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href={`/login?next=${encodeURIComponent(`/invitations/accept?token=${token}`)}`}>
              {wrongAccount ? 'Sign in as the invited address' : 'Sign in to continue'}
            </Link>
          </Button>
        ) : null}
      </Outcome>
    );
  }

  if (mutation.isSuccess) {
    return (
      <Outcome
        icon={<CircleCheck className="size-5 text-status-operational" aria-hidden="true" />}
        title="Invitation accepted"
      >
        <p className="text-sm text-muted-foreground">Taking you to the dashboard…</p>
      </Outcome>
    );
  }

  return (
    <Outcome
      icon={<Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />}
      title="Accepting your invitation"
    >
      <p className="text-sm text-muted-foreground">This only takes a moment.</p>
    </Outcome>
  );
}

function Outcome({
  icon,
  title,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="text-center" aria-live="polite">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3 text-left">{children}</div>
    </div>
  );
}
