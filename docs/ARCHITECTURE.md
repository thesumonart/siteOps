# Architecture

## Shape

SiteOps is a **modular monolith with one separate worker process**. Not microservices: a solo
developer maintaining a dozen services spends their time on deployment plumbing rather than on
monitoring. The split that does exist is the one that matters — the worker makes outbound requests
to untrusted addresses on a schedule, which is a different failure and security profile from
serving a dashboard.

```text
                          ┌──────────────┐
                          │   Browser    │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │   Next.js    │  App Router, server components
                          │     web      │  Sessions forwarded to the API
                          └──────┬───────┘
                                 │ REST, cookie-authenticated
                          ┌──────▼───────┐
                          │   NestJS     │  Controllers → Services → Repositories
                          │     api      │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │   MongoDB    │
                          └──────▲───────┘
                                 │
                          ┌──────┴───────┐
                          │  Monitoring  │  Scheduler → Checker → Result processor
                          │    worker    │  → Incidents → Notifications
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │  The public  │
                          │   internet   │
                          └──────────────┘
```

## Layering

Business logic never lives in an HTTP controller or a React component.

```text
Controller   validates input, resolves the caller, returns a DTO
    ↓
Service      the actual rules; knows nothing about HTTP
    ↓
Repository   queries, always scoped by organizationId
    ↓
MongoDB
```

The practical test: every service method must be callable from the worker, which has no HTTP layer
at all. If a rule cannot be reached without a `Request` object, it is in the wrong place.

## Packages

| Package             | Purpose                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `@siteops/shared`   | Isomorphic domain: statuses, roles, permissions, Zod schemas, URL/IP validation, uptime math |
| `@siteops/database` | Mongoose models, the shared connection, index definitions                                    |
| `@siteops/config`   | ESLint flat configs and TypeScript presets                                                   |

`@siteops/shared` is imported by all three apps. That is what makes a validation rule identical in
the browser form, the API pipe and the worker — there is only one copy of it.

## Decisions

### Zod everywhere, not class-validator

NestJS conventionally uses `class-validator` DTOs. SiteOps uses Zod schemas from `@siteops/shared`
via a `ZodValidationPipe` instead, because the same schema also drives the React Hook Form
resolver. Two validation systems would drift, and the drift would show up as a form that accepts
input the API rejects.

### No `packages/ui`

Shared UI packages earn their place when two applications render the same components. SiteOps has
one frontend, so components live in `apps/web/src/components`. Extracting them now would add a
build step and an indirection for no consumer.

### One test runner

Vitest runs everywhere. The API needs `design:paramtypes` for dependency injection, which esbuild
does not emit, so its Vitest config transforms through SWC (`unplugin-swc`). One runner is worth a
plugin.

### Rate limiting is hand-written

`@nestjs/throttler` does not support NestJS 12 (its peer range stops at 11). The limiter in
`apps/api/src/common/rate-limit` is about a hundred lines, is unit-tested, and has a narrow enough
interface to be re-implemented over Redis when there is more than one API instance. See
[SECURITY.md](SECURITY.md).

### No `@nestjs/cli`

The API builds with plain `tsc`, which emits decorator metadata correctly. Dropping the CLI removed
a dependency whose `@nestjs/schematics` peer wants TypeScript 6, which `typescript-eslint` does not
yet support.

### TypeScript 5.9, not 7

`typescript-eslint@8` declares a `typescript >=4.8.4 <6.1.0` peer range. Installing TypeScript 7
would silently disable every type-aware lint rule, which is most of the value of the lint setup.
Revisit when `typescript-eslint` ships support.

### Jobs without Redis

The worker claims work with an atomic `findOneAndUpdate` that sets a lease on the website document.
Expired leases are reclaimable, so a crashed worker cannot strand a site. This runs on the free
tier with no queue infrastructure. The job interface is deliberately narrow, so BullMQ can be
introduced behind it when check volume justifies the cost. See [MONITORING.md](MONITORING.md).

### Subscription and Report are not modelled yet

Billing and client reports are roadmap items. `plan` lives on the organization document and limits
are enforced server-side from `PLAN_LIMITS`. A `Subscription` collection will exist when there is a
payment provider to reconcile against; creating it now would be a table nothing writes to.

## Multi-tenancy

Every organization-owned document carries `organizationId`, and every repository method takes it as
a required argument. The organization is never trusted from the client: the request carries an id,
and the API resolves membership from the session before any query runs. A request for a resource in
another tenant returns `404`, not `403`, so identifiers cannot be enumerated across organizations.

## Request lifecycle

```text
Request
  → RequestContextMiddleware   assigns a correlation id, logs completion
  → RateLimitGuard             per-client, per-route budget
  → AuthGuard                  session required unless @Public
  → OrganizationGuard          membership and permission for the target org
  → ZodValidationPipe          parses and normalizes the payload
  → Controller → Service → Repository
  → ResponseInterceptor        wraps the result in { success: true, data }
  → AllExceptionsFilter        wraps any failure in { success: false, error }
```

Access is denied by default. A route is public only when it says so.
