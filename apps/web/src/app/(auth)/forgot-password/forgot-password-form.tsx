'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
  type ForgotPasswordInput,
} from '@siteops/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, fieldAria } from '@/components/forms/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { requestPasswordReset } from '@/lib/auth';

export function ForgotPasswordForm(): React.ReactElement {
  const form = useForm<ForgotPasswordFormValues, unknown, ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordInput) => requestPasswordReset(values.email),
  });

  /*
   * The confirmation is deliberately identical whether or not an account
   * exists. Saying "no account found" would turn this form into a way to test
   * which addresses are registered.
   */
  if (mutation.isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
          <MailCheck className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          If an account exists for that address, we have sent a link to reset the password. It
          expires in an hour.
        </p>
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

  const { errors } = form.formState;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your email and we will send you a link to choose a new password.
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
        {mutation.error ? (
          <Alert variant="error">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Something went wrong. Try again shortly.'}
          </Alert>
        ) : null}

        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            {...fieldAria('email', false, errors.email?.message)}
            {...form.register('email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
          />
        </Field>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
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
