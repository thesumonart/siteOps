'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  MIN_PASSWORD_LENGTH,
  registerSchema,
  type RegisterFormValues,
  type RegisterInput,
} from '@siteops/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/forms/field';
import { ApiError } from '@/lib/api-client';
import { signUp } from '@/lib/auth';

export function RegisterForm(): React.ReactElement {
  const router = useRouter();

  const form = useForm<RegisterFormValues, unknown, RegisterInput>({
    // The exact schema the API validates against, so the browser and the server
    // can never disagree about what is acceptable.
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: signUp,
    onSuccess: (_user, variables) => {
      // No session exists yet: the account is unusable until the address is
      // confirmed, so the next step is the "check your inbox" screen.
      router.push(`/verify-email?email=${encodeURIComponent(variables.email)}`);
    },
    onError: (error: Error) => {
      if (!(error instanceof ApiError)) return;

      if (error.code === 'EMAIL_ALREADY_REGISTERED') {
        form.setError('email', { message: error.message });
        return;
      }
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        if (field === 'name' || field === 'email' || field === 'password') {
          form.setError(field, { message });
        }
      }
    },
  });

  const formError =
    mutation.error instanceof ApiError &&
    mutation.error.code !== 'EMAIL_ALREADY_REGISTERED' &&
    mutation.error.fields.length === 0
      ? mutation.error.message
      : null;

  const { errors } = form.formState;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Start monitoring your first website in a couple of minutes.
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
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <Field id="name" label="Your name" error={errors.name?.message}>
          <Input
            {...fieldAria('name', false, errors.name?.message)}
            {...form.register('name')}
            autoComplete="name"
            autoFocus
          />
        </Field>

        <Field id="email" label="Work email" error={errors.email?.message}>
          <Input
            {...fieldAria('email', false, errors.email?.message)}
            {...form.register('email')}
            type="email"
            inputMode="email"
            autoComplete="email"
          />
        </Field>

        <Field
          id="password"
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A memorable phrase beats a short complex one.`}
          error={errors.password?.message}
        >
          <Input
            {...fieldAria('password', true, errors.password?.message)}
            {...form.register('password')}
            type="password"
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" disabled={mutation.isPending} className="mt-1">
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </div>
  );
}
