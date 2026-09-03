# CLAUDE.md

Working notes for this repository. Read before changing anything.

## What this is

SiteOps is a production website-monitoring SaaS for agencies: add client websites, and it checks
uptime, HTTP status and response time on a schedule, confirms real outages, opens and resolves
incidents, and emails the people who need to know.

It is a real product, not a demo. Nothing in it may be faked.

## Stack

| Layer    | Choice                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| Web      | Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, TanStack Query           |
| API      | NestJS 12, REST, Zod validation                                                     |
| Worker   | Node, no framework                                                                  |
| Database | MongoDB (Atlas), Mongoose                                                           |
| Auth     | Better Auth                                                                         |
| Tooling  | pnpm workspaces, Turborepo, TypeScript 5.9, ESLint 10, Prettier, Vitest, Playwright |

Version choices that are deliberate and must not be "upgraded" casually:

- **TypeScript 5.9, not 7.** `typescript-eslint@8` peers on `typescript <6.1.0`; TS 7 silently
  disables every type-aware lint rule.
- **No `@nestjs/throttler`.** It does not support NestJS 12. Rate limiting is hand-written in
  `apps/api/src/common/rate-limit`.
- **No `@nestjs/cli`.** The API builds with plain `tsc`, which emits decorator metadata.

## Layout

```text
apps/web       Next.js dashboard        apps/api     NestJS REST API
apps/worker    Monitoring worker
packages/shared    Domain types, Zod schemas, URL/IP validation, uptime math
packages/database  Mongoose models, connection, indexes
packages/config    ESLint and TypeScript presets
docs/          Architecture, API, database, security, monitoring, deployment
```

## Commands

Everything runs from the repository root.

```bash
pnpm dev            # web + api + worker
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format
pnpm format:check
pnpm docker:up      # local MongoDB replica set
pnpm --filter @siteops/database indexes:sync
```

## Conventions

**Layering.** `Controller → Service → Repository → MongoDB`. Business logic lives in services and
must be callable from the worker, which has no HTTP layer. If a rule needs a `Request` object, it is
in the wrong place. React components never contain business logic either.

**Validation.** One Zod schema per concept, in `@siteops/shared`, used by both the browser form and
the API's `ZodValidationPipe`. Do not add `class-validator` DTOs; two validation systems drift.

**Types.** Strict, including `noUncheckedIndexedAccess`. `any` is an ESLint error. If it is truly
unavoidable, document why on the line.

**Database.** Every organization-scoped query takes `organizationId`. Timestamps are UTC. New
indexes need a stated query and a note in `docs/DATABASE.md`.

**API.** Success is `{ success: true, data }`; failure is `{ success: false, error: { code, message } }`.
Error codes come from `API_ERROR_CODES`. Everything paginated, never unbounded.

**UI.** shadcn/ui, tokens from `globals.css`. Status is never colour alone — use `StatusBadge`.
Every async view handles loading, empty and error. Server state lives in TanStack Query; Zustand is
only for genuine client state.

**Comments.** Explain decisions, security reasoning and non-obvious edge cases. Do not restate the
code.

## Security rules

These are not style preferences.

1. **SSRF.** Users control the URLs the worker fetches. String validation happens at creation
   (`normalizeWebsiteUrl`); the authoritative check is `classifyIpAddress` against the **resolved
   IP, immediately before connecting, on every redirect hop**. Never weaken either layer. Never
   remove an entry from the blocked ranges. New bypass ideas get a test.
2. **Tenant isolation.** Never trust an organization id from the client. Resolve membership from
   the session first. Another tenant's resource is a `404`, never a `403`.
3. **Authorization.** Check permissions, never role names. Deny by default; `@Public` is explicit.
4. **Secrets.** Never commit `.env`. Never log a password, token or connection string. Never expose
   a non-`NEXT_PUBLIC_` value to the browser.
5. **Errors.** Never return a stack trace, driver error or internal path to a client.
6. **Auth.** Never hand-roll password hashing or session management. That is Better Auth's job.
7. **`MONITOR_ALLOW_PRIVATE_ADDRESSES`** exists for tests only and is refused in production.

## Monitoring rules

- Never declare a site down on one failed check. Failure and recovery thresholds exist to absorb
  transient noise.
- Incident and notification logic must be idempotent. The guarantees are enforced by unique
  indexes (`incident_one_open_per_website`, `notification_dedupe_unique`), not by application
  bookkeeping — keep it that way.
- One notification per incident transition. Never repeat while a site stays down.
- Uptime is floored, never rounded up. Response-time statistics exclude failed checks.
- No magic numbers. Monitoring parameters are environment variables validated at startup.

## Git

- Conventional Commits, lowercase, imperative: `feat: add website management api`.
- Commit after each meaningful, working portion. Verify first:
  `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm build` after
  architectural changes.
- Push after each verified commit.

## Never do these

- Never add `Co-authored-by`, `Generated with`, or any AI/Claude/ChatGPT attribution to a commit,
  PR, or code comment. Commits carry the developer's own identity and nothing else.
- Never mention AI in a commit message.
- Never `git push --force` or rewrite remote history without being asked.
- Never change the configured Git identity.
- Never commit `.env` or any real secret.
- Never fake monitoring data, uptime, incidents, response times or API responses. Mock data is for
  tests and isolated UI development only.
- Never create placeholder pages or routes for features that are not implemented. Put them in
  `docs/ROADMAP.md` instead.
- Never leave dead code: unused imports, files, components, or commented-out implementations.
- Never disable a lint rule or a type error to make something pass. Fix the cause.
- Never commit code knowing a check fails.
- Never weaken SSRF protection, tenant isolation or authorization to make a test or feature easier.

## Keeping this current

Update this file when an architectural decision changes: a new package, a changed layer boundary, a
new security rule, or a version pin with a reason. Deeper detail belongs in `docs/`, not here.
