'use client';

import { PLAN_LABELS, type OrganizationMembershipDto } from '@siteops/shared';
import { Building2, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { writeActiveOrganizationCookie } from '@/lib/active-organization';
import { cn } from '@/lib/utils';

export interface OrganizationSwitcherProps {
  readonly memberships: readonly OrganizationMembershipDto[];
  readonly activeOrganizationId: string;
}

/**
 * Switches which organization the dashboard is showing.
 *
 * The choice is written to a cookie and the route is refreshed so server
 * components re-render against the new organization. Nothing is trusted from
 * here — the API re-checks membership on every request.
 */
export function OrganizationSwitcher({
  memberships,
  activeOrganizationId,
}: OrganizationSwitcherProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const active =
    memberships.find((entry) => entry.organization.id === activeOrganizationId) ?? memberships[0];

  if (!active) {
    return <span className="text-sm text-muted-foreground">No organization</span>;
  }

  const select = (organizationId: string): void => {
    setOpen(false);
    if (organizationId === activeOrganizationId) return;

    writeActiveOrganizationCookie(organizationId);
    // Server components read the cookie, so the tree has to be re-rendered.
    router.refresh();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
          'outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
        aria-label={`Current organization: ${active.organization.name}. Switch organization`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{active.organization.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {PLAN_LABELS[active.organization.plan]} · {active.role}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[15rem]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.map((entry) => (
          <DropdownMenuCheckItem
            key={entry.organization.id}
            checked={entry.organization.id === activeOrganizationId}
            onSelect={() => {
              select(entry.organization.id);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{entry.organization.name}</span>
            <span className="text-xs text-muted-foreground">{entry.role}</span>
          </DropdownMenuCheckItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            router.push('/onboarding');
          }}
        >
          <Plus aria-hidden="true" />
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
