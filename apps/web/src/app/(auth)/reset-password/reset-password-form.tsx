'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  MIN_PASSWORD_LENGTH,
  resetPasswordSchema,
  type ResetPasswordFormValues,
  type ResetPasswordInput,
} from '@siteops/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, fieldAria } from '@/components/forms/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { resetPassword } from '@/lib/auth';

export function ResetPasswordForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const form = useForm<ResetPasswordFormValues, unknown, ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordInput) => resetPassword(values.token, values.password),
    onSuccess: () => {
      // Resetting revokes every existing session, so the person has to sign in
      // again with the new password — including on any device that was stolen.
      router.replace('/login?reset=1');
    },
  });

  if (token.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight">This link is incomplete</h1>
        <Alert variant="error" className="mt-4">
          The reset link is missing its token. Request a new one and open the link directly from the
          email.
        </Alert>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const isDeadToken = error?.code === 'INVALID_TOKEN' || error?.code === 'TOKEN_EXPIRED';
  const { errors } = form.formState;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        You will be signed out everywhere else once it is changed.
      </p>

      <form
        className="mt-6 grid gap-4"
        onSubmit={(event) => {
          // handleSubmit returns a promise; the DOM handler must not.
          void form.handleSubmit((values) => {
            mutation.mutate(values);
          })(event);
        }}
        noValidate
      >
        {error ? (
          <Alert variant="error">
            {error.message}
            {isDeadToken ? (
              <>
                {' '}
                <Link href="/forgot-password" className="font-medium underline underline-offset-4">
                  Request a new link
                </Link>
                .
              </>
            ) : null}
          </Alert>
        ) : null}

        <input type="hidden" {...form.register('token')} />

        <Field
          id="password"
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={errors.password?.message}
        >
          <Input
            {...fieldAria('password', true, errors.password?.message)}
            {...form.register('password')}
            type="password"
            autoComplete="new-password"
            autoFocus
          />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirm password"
          error={errors.confirmPassword?.message}
        >
          <Input
            {...fieldAria('confirmPassword', false, errors.confirmPassword?.message)}
            {...form.register('confirmPassword')}
            type="password"
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Change password'
          )}
        </Button>
      </form>
    </div>
  );
}
