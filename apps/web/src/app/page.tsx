import type { WebsiteStatus } from '@siteops/shared';
import { Activity, Bell, Building2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

const CAPABILITIES = [
  {
    icon: Activity,
    title: 'Uptime and response time',
    body: 'Every site is checked on a schedule you control, with response times recorded on each check.',
  },
  {
    icon: ShieldCheck,
    title: 'Confirmed incidents, not noise',
    body: 'An outage is only declared after consecutive failures, so a blip on one request never pages you.',
  },
  {
    icon: Bell,
    title: 'One alert per incident',
    body: 'You are told when a site goes down and when it comes back. Never the same alert twice.',
  },
  {
    icon: Building2,
    title: 'Built for many clients',
    body: 'Group sites by organization, invite your team, and give each person the access they need.',
  },
] as const;

interface ExampleRow {
  readonly site: string;
  readonly status: WebsiteStatus;
  readonly uptime: string;
  readonly response: string;
}

const EXAMPLE_ROWS: readonly ExampleRow[] = [
  { site: 'acme.com', status: 'operational', uptime: '99.99%', response: '213 ms' },
  { site: 'store.example', status: 'degraded', uptime: '99.62%', response: '2.4 s' },
  { site: 'startup.io', status: 'down', uptime: '98.11%', response: '—' },
];

export default function HomePage(): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <nav
          className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
          aria-label="Main"
        >
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="size-5 text-primary" aria-hidden="true" />
            SiteOps
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Monitor every client website from one dashboard.
            </h1>
            <p className="mt-5 text-lg text-pretty text-muted-foreground">
              SiteOps checks your sites around the clock, confirms real outages before it alerts
              you, and keeps the uptime history your clients ask about.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/register">Start monitoring</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>

          {/*
            A static illustration of the dashboard's own vocabulary. These are
            example rows, labelled as such — the product never shows invented
            monitoring data as if it were real.
          */}
          <div className="mt-16 overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="flex items-center justify-between border-b px-5 py-3 text-xs font-medium text-muted-foreground">
              <span>Example view</span>
              <span aria-hidden="true">Uptime · 30 days</span>
            </div>
            <table className="w-full text-sm">
              <caption className="sr-only">
                An example of how monitored websites appear in the SiteOps dashboard.
              </caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Website
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="hidden px-5 py-2.5 text-right font-medium sm:table-cell"
                  >
                    Uptime
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">
                    Response
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {EXAMPLE_ROWS.map((row) => (
                  <tr key={row.site}>
                    <td className="px-5 py-3 font-medium">{row.site}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="tabular-figures hidden px-5 py-3 text-right font-mono text-xs sm:table-cell">
                      {row.uptime}
                    </td>
                    <td className="tabular-figures px-5 py-3 text-right font-mono text-xs">
                      {row.response}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto grid w-full max-w-6xl gap-px px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="sm:px-6 sm:first:pl-0 sm:last:pr-0">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-medium">{title}</h2>
                <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>SiteOps</span>
          <span>Website monitoring for agencies</span>
        </div>
      </footer>
    </div>
  );
}
