'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROLE_LABELS,
  inviteMemberSchema,
  type InviteMemberFormValues,
  type InviteMemberInput,
} from '@siteops/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, fieldAria } from '@/components/forms/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { inviteMember } from '@/lib/organizations';
import { cn } from '@/lib/utils';

const ROLE_HINTS: Record<'admin' | 'member', string> = {
  admin: 'Can add and remove websites, manage monitoring and invite people.',
  member: 'Can see websites, monitoring and incidents, but not change them.',
};

export interface InviteMemberFormProps {
  readonly organizationId: string;
  readonly onInvited: () => void;
}

export function InviteMemberForm({
  organizationId,
  onInvited,
}: InviteMemberFormProps): React.ReactElement {
  const form = useForm<InviteMemberFormValues, unknown, InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const mutation = useMutation({
    mutationFn: (values: InviteMemberInput) =>
      inviteMember(organizationId, { email: values.email, role: values.role }),
    onSuccess: () => {
      form.reset({ email: '', role: 'member' });
      onInvited();
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === 'ALREADY_A_MEMBER') {
        form.setError('email', { message: error.message });
      }
    },
  });

  const error =
    mutation.error instanceof ApiError && mutation.error.code !== 'ALREADY_A_MEMBER'
      ? mutation.error.message
      : null;
  const { errors } = form.formState;
  // `useWatch` subscribes to one field; `form.watch()` cannot be memoized safely.
  const selectedRole = useWatch({ control: form.control, name: 'role' });

  return (
    <section aria-labelledby="invite-heading" className="rounded-xl border p-4">
      <h2 id="invite-heading" className="text-sm font-medium">
        Invite someone
      </h2>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">
        They get an email with a link that works only for their address.
      </p>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start"
        onSubmit={(event) => {
          void form.handleSubmit((values) => {
            mutation.mutate(values);
          })(event);
        }}
        noValidate
      >
        <Field id="invite-email" label="Email address" error={errors.email?.message}>
          <Input
            {...fieldAria('invite-email', false, errors.email?.message)}
            {...form.register('email')}
            type="email"
            inputMode="email"
            placeholder="teammate@agency.com"
            autoComplete="off"
          />
        </Field>

        <Field id="invite-role" label="Role" error={errors.role?.message}>
          {/*
            A native select rather than a custom listbox: it is keyboard and
            screen-reader correct for free, and renders as the platform picker
            on mobile.
          */}
          <select
            {...fieldAria('invite-role', false, errors.role?.message)}
            {...form.register('role')}
            className={cn(
              'h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs sm:w-32',
              'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            )}
          >
            <option value="member">{ROLE_LABELS.member}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
          </select>
        </Field>

        <div className="sm:pt-[1.625rem]">
          <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              <>
                <Send aria-hidden="true" />
                Send invite
              </>
            )}
          </Button>
        </div>

        <div className="sm:col-span-3">
          {error ? <Alert variant="error">{error}</Alert> : null}
          {mutation.isSuccess ? (
            <Alert variant="success">Invitation sent.</Alert>
          ) : (
            <p className="text-xs text-muted-foreground">
              {ROLE_HINTS[selectedRole === 'admin' ? 'admin' : 'member']}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
