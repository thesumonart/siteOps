'use client';

import type { UpdateNotificationPreferencesInput } from '@siteops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { queryKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/api-client';
import { fetchNotificationSettings, updateNotificationSettings } from '@/lib/monitoring';
import { cn } from '@/lib/utils';

export interface NotificationSettingsFormProps {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly email: string;
}

/**
 * Alert preferences for the signed-in user, in this organization only.
 *
 * Each toggle sends just the field it changed. Sending the whole object would
 * let a stale tab silently undo a change made somewhere else.
 */
export function NotificationSettingsForm({
  organizationId,
  organizationName,
  email,
}: NotificationSettingsFormProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.notificationSettings(organizationId),
    queryFn: () => fetchNotificationSettings(),
  });

  const mutation = useMutation({
    mutationFn: (input: UpdateNotificationPreferencesInput) => updateNotificationSettings(input),
    onSuccess: (data) => {
      setError(null);
      setSaved(true);
      queryClient.setQueryData(queryKeys.notificationSettings(organizationId), data);
    },
    onError: (mutationError: Error) => {
      setSaved(false);
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : 'Your preferences could not be saved.',
      );
    },
  });

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2" aria-busy="true" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Loading preferences…</span>
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="error" title="Could not load your preferences">
        Try reloading the page.
      </Alert>
    );
  }

  const preferences = query.data.preferences;

  return (
    <div className="grid gap-4">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <section aria-labelledby="alerts-heading" className="rounded-xl border">
        <div className="border-b px-5 py-4">
          <h2 id="alerts-heading" className="text-sm font-medium">
            Email alerts
          </h2>
          <p className="mt-1 text-xs text-pretty text-muted-foreground">
            Sent to {email} for sites in {organizationName}. Preferences are per organization, so
            these do not affect other organizations you belong to.
          </p>
        </div>

        <div className="divide-y">
          <ToggleRow
            id="website-down"
            label="A website goes down"
            description="One email when an outage is confirmed. It is never repeated while the site stays down."
            checked={preferences.websiteDown}
            disabled={mutation.isPending}
            onChange={(value) => {
              mutation.mutate({ websiteDown: value });
            }}
          />
          <ToggleRow
            id="website-recovered"
            label="A website recovers"
            description="One email when the site responds normally again and the incident is resolved."
            checked={preferences.websiteRecovered}
            disabled={mutation.isPending}
            onChange={(value) => {
              mutation.mutate({ websiteRecovered: value });
            }}
          />
        </div>
      </section>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {mutation.isPending ? (
          'Saving…'
        ) : saved ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-3.5" aria-hidden="true" />
            Preferences saved
          </span>
        ) : (
          ''
        )}
      </p>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{description}</p>
      </div>

      {/*
        A real checkbox rather than a styled div: it arrives with the right
        role, keyboard behaviour and announced state for free.
      */}
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer accent-primary',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />
    </div>
  );
}
