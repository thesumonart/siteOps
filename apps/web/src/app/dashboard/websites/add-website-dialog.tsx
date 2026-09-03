'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_MONITORING_INTERVAL_SECONDS,
  MONITORING_INTERVALS_SECONDS,
  MONITORING_INTERVAL_LABELS,
  createWebsiteSchema,
  type CreateWebsiteInput,
} from '@siteops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, fieldAria } from '@/components/forms/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { createWebsite } from '@/lib/websites';
import { cn } from '@/lib/utils';

type FormValues = z.input<typeof createWebsiteSchema>;

export interface AddWebsiteDialogProps {
  readonly organizationId: string;
  /** Intervals below the plan's minimum are not offered. */
  readonly minIntervalSeconds: number;
}

export function AddWebsiteDialog({
  organizationId,
  minIntervalSeconds,
}: AddWebsiteDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues, unknown, CreateWebsiteInput>({
    resolver: zodResolver(createWebsiteSchema),
    defaultValues: {
      name: '',
      url: '',
      monitoringIntervalSeconds: DEFAULT_MONITORING_INTERVAL_SECONDS,
    },
  });

  const mutation = useMutation({
    mutationFn: createWebsite,
    onSuccess: async () => {
      form.reset();
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ['organizations', organizationId, 'websites'],
      });
    },
    onError: (error: Error) => {
      if (!(error instanceof ApiError)) return;

      // The URL problems belong on the URL field, where the person can fix them.
      if (
        error.code === 'WEBSITE_URL_ALREADY_MONITORED' ||
        error.code === 'BLOCKED_WEBSITE_URL' ||
        error.code === 'INVALID_WEBSITE_URL'
      ) {
        form.setError('url', { message: error.message });
        return;
      }
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        if (field === 'name' || field === 'url') form.setError(field, { message });
      }
    },
  });

  const formLevelError =
    mutation.error instanceof ApiError &&
    !['WEBSITE_URL_ALREADY_MONITORED', 'BLOCKED_WEBSITE_URL', 'INVALID_WEBSITE_URL'].includes(
      mutation.error.code,
    ) &&
    mutation.error.fields.length === 0
      ? mutation.error.message
      : null;

  const { errors } = form.formState;
  const availableIntervals = MONITORING_INTERVALS_SECONDS.filter(
    (seconds) => seconds >= minIntervalSeconds,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden="true" />
          Add website
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a website</DialogTitle>
          <DialogDescription>
            Monitoring starts as soon as it is added. You can pause it at any time.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              mutation.mutate(values);
            })(event);
          }}
          noValidate
        >
          {formLevelError ? <Alert variant="error">{formLevelError}</Alert> : null}

          <Field
            id="website-name"
            label="Name"
            hint="How this site appears in your dashboard."
            error={errors.name?.message}
          >
            <Input
              {...fieldAria('website-name', true, errors.name?.message)}
              {...form.register('name')}
              placeholder="Acme Corp"
              autoFocus
            />
          </Field>

          <Field
            id="website-url"
            label="URL"
            hint="Public http or https address. Internal and private addresses cannot be monitored."
            error={errors.url?.message}
          >
            <Input
              {...fieldAria('website-url', true, errors.url?.message)}
              {...form.register('url')}
              inputMode="url"
              placeholder="acme.com"
            />
          </Field>

          <Field
            id="website-interval"
            label="Check every"
            error={errors.monitoringIntervalSeconds?.message}
          >
            <select
              {...fieldAria('website-interval', false, errors.monitoringIntervalSeconds?.message)}
              {...form.register('monitoringIntervalSeconds', { valueAsNumber: true })}
              className={cn(
                'h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs',
                'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              )}
            >
              {availableIntervals.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {MONITORING_INTERVAL_LABELS[seconds]}
                </option>
              ))}
            </select>
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                'Add website'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
