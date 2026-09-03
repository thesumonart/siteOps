'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createOrganizationSchema,
  type CreateOrganizationFormValues,
  type CreateOrganizationInput,
} from '@siteops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, fieldAria } from '@/components/forms/field';
import { Input } from '@/components/ui/input';
import { writeActiveOrganizationCookie } from '@/lib/active-organization';
import { ApiError } from '@/lib/api-client';
import { createOrganization } from '@/lib/organizations';
import { queryKeys } from '@/lib/query-keys';

export function CreateOrganizationForm(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<CreateOrganizationFormValues, unknown, CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateOrganizationInput) => createOrganization(values.name),
    onSuccess: async (membership) => {
      // Make the new organization the active one before navigating, so the
      // dashboard renders it rather than whatever was selected before.
      writeActiveOrganizationCookie(membership.organization.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      router.replace('/dashboard');
      router.refresh();
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === 'ORGANIZATION_SLUG_TAKEN') {
        form.setError('name', { message: error.message });
      }
    },
  });

  const error =
    mutation.error instanceof ApiError && mutation.error.code !== 'ORGANIZATION_SLUG_TAKEN'
      ? mutation.error.message
      : null;
  const { errors } = form.formState;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Create your organization</h1>
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        An organization groups the websites you look after and the people who can see them. Most
        agencies start with one and add more per client later.
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
        {error ? <Alert variant="error">{error}</Alert> : null}

        <Field
          id="name"
          label="Organization name"
          hint="Usually your agency or company name."
          error={errors.name?.message}
        >
          <Input
            {...fieldAria('name', true, errors.name?.message)}
            {...form.register('name')}
            autoComplete="organization"
            autoFocus
          />
        </Field>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Creating…
            </>
          ) : (
            'Create organization'
          )}
        </Button>
      </form>
    </div>
  );
}
