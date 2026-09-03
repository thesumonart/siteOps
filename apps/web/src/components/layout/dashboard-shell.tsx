'use client';

import type { OrganizationMembershipDto, Permission, UserDto } from '@siteops/shared';
import { Activity, Globe, LayoutDashboard, Menu, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { OrganizationSwitcher } from '@/components/layout/organization-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { cn } from '@/lib/utils';

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  /** Hidden when the current role lacks this. The API enforces it regardless. */
  readonly permission?: Permission;
}

/**
 * Only routes that exist are listed. Websites, incidents and notifications join
 * this list as they are built, rather than sitting here as dead links.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/websites', label: 'Websites', icon: Globe, permission: 'website:read' },
  { href: '/dashboard/members', label: 'Members', icon: Users, permission: 'member:read' },
];

export interface DashboardShellProps {
  readonly user: UserDto;
  readonly memberships: readonly OrganizationMembershipDto[];
  readonly activeOrganizationId: string;
  readonly permissions: readonly Permission[];
  readonly children: React.ReactNode;
}

export function DashboardShell({
  user,
  memberships,
  activeOrganizationId,
  permissions,
  children,
}: DashboardShellProps): React.ReactElement {
  const pathname = usePathname();

  /*
   * The drawer remembers which route it was opened on, so any navigation —
   * including the browser's back button — closes it. Adjusting state during
   * render is React's recommended alternative to a `useEffect` that only exists
   * to reset state when a prop changes.
   */
  const [nav, setNav] = useState({ open: false, openedAt: pathname });
  if (nav.open && nav.openedAt !== pathname) {
    setNav({ open: false, openedAt: pathname });
  }
  const mobileNavOpen = nav.open && nav.openedAt === pathname;

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.permission === undefined || permissions.includes(item.permission),
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-1">
        <OrganizationSwitcher
          memberships={memberships}
          activeOrganizationId={activeOrganizationId}
        />
      </div>

      <nav aria-label="Dashboard" className="flex flex-1 flex-col gap-0.5">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t pt-3">
        <p className="truncate px-2 text-sm font-medium">{user.name}</p>
        <p className="truncate px-2 text-xs text-muted-foreground">{user.email}</p>
        <div className="mt-1.5">
          <SignOutButton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Mobile bar. The sidebar is a drawer below the lg breakpoint rather
          than a squeezed column. */}
      <header className="flex h-14 items-center gap-2 border-b px-4 lg:hidden">
        <button
          type="button"
          onClick={() => {
            setNav((current) => ({ open: !current.open, openedAt: pathname }));
          }}
          aria-expanded={mobileNavOpen}
          aria-controls="dashboard-nav"
          className="-ml-2 flex size-11 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {mobileNavOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
          <span className="sr-only">{mobileNavOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <Activity className="size-5 text-primary" aria-hidden="true" />
          SiteOps
        </span>
      </header>

      <aside id="dashboard-nav" hidden={!mobileNavOpen} className="border-b bg-sidebar lg:hidden">
        {sidebar}
      </aside>

      <aside className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
