'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginFormValues, type LoginInput } from '@siteops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, fieldAria } from '@/components/forms/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { signIn } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';

export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const form = useForm<LoginFormValues, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      /*
       * `next` is honoured only when it is a path on this site. Redirecting to
       * an arbitrary value would turn sign-in into an open redirect, which is a
       * ready-made phishing primitive.
       */
      const next = searchParams.get('next');
      const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
      router.replace(destination);
      router.refresh();
    },
  });

  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const needsVerification = error?.code === 'EMAIL_NOT_VERIFIED';
  const { errors } = form.formState;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Welcome back. Enter your details to continue.
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
            {needsVerification ? (
              <>
                {' '}
                <Link
                  href={`/verify-email?email=${encodeURIComponent(form.getValues('email'))}`}
                  className="font-medium underline underline-offset-4"
                >
                  Resend the confirmation email
                </Link>
                .
              </>
            ) : null}
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

        <Field id="password" label="Password" error={errors.password?.message}>
          <Input
            {...fieldAria('password', false, errors.password?.message)}
            {...form.register('password')}
            type="password"
            autoComplete="current-password"
          />
        </Field>

        <div className="-mt-1 flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </div>
  );
}
