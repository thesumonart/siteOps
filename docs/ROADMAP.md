# Roadmap

Ordered. Nothing is started before the thing above it is stable, and no page exists in the product
for a feature that is not implemented.

## Shipped

- **Foundation** — pnpm monorepo, Turborepo, TypeScript, ESLint, Prettier with Tailwind class
  sorting, EditorConfig, Husky + lint-staged, Docker development database, CI
- **Shared domain** — statuses, roles, permissions, plan limits, Zod schemas, URL and IP
  validation, uptime math
- **Database** — Mongoose models with tenant-scoped indexes, retention, index sync script
- **API foundation** — error envelope, sanitized exception filter, Zod validation pipe, rate
  limiting, structured logging, health and readiness probes
- **Web foundation** — Next.js App Router, Tailwind v4 design tokens, shadcn/ui base, accessible
  status components
- **Worker foundation** — validated configuration, structured logging, health probes, graceful
  shutdown
- **Authentication** — registration, sign-in, sign-out, email verification, password reset,
  sessions, server-side route protection, transactional email
- **Organizations** — creation, switching, members, roles, permissions, invitations, tenant
  isolation, audit logging

## In progress

- **Website management** — add, edit, delete, pause and resume monitoring

## Next

- **Monitoring engine** — scheduler, HTTP checker, SSRF address validation, persistence,
  concurrency control
- **Incidents** — failure and recovery thresholds, creation, resolution, deduplication, history
- **Notifications** — service, email templates, preferences, deduplication
- **Dashboard** — overview, websites, website detail, incidents, settings, charts, filters
- **Hardening and deployment** — security review, indexes, retention, E2E tests, production deploy

## Later

Not built until the monitoring core is stable in production.

| Version | Features                                              |
| ------- | ----------------------------------------------------- |
| V2      | SSL monitoring, domain expiry, performance monitoring |
| V3      | SEO checks, broken links, change detection            |
| V4      | Client portals, white-label and scheduled reports     |
| V5      | Slack, Discord, webhooks, API keys                    |
| V6      | Subscriptions, billing, usage limits, team plans      |
| V7      | AI explanations and anomaly detection over real data  |

AI features explain SiteOps' own monitoring data. There is no general-purpose chatbot, and nothing
about a website's health is ever generated rather than measured.
