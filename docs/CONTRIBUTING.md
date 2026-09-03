# Contributing

Solo project, deliberately simple workflow.

## Setup

See the [README](../README.md). In short: `pnpm install`, `cp .env.example .env`, `pnpm docker:up`,
`pnpm dev`.

## Workflow

1. **Inspect** — read the existing implementation before changing it.
2. **Implement** — the smallest coherent change.
3. **Verify** — everything below must pass.
4. **Commit** — one focused change per commit.
5. **Push**.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build      # after architectural or production-facing changes
```

Never commit knowingly broken code to create more commits.

## Commits

Conventional Commit style, lowercase, imperative.

```text
chore: configure prettier
feat: add website management api
fix: prevent duplicate incidents
test: add ssrf integration tests
docs: update deployment guide
```

Commits carry the author's own Git identity and nothing else. No `Co-authored-by` trailers, no
tool attribution, no mention of how the code was written.

Never force-push.

## Branches

Work on `main` for small changes; use a short-lived feature branch for anything larger. No GitFlow.

## Conventions

**TypeScript** — strict, including `noUncheckedIndexedAccess`. `any` is an ESLint error. Prefer
discriminated unions over optional-field soup, and type the boundaries: API responses, domain
models, service signatures.

**Validation** — one Zod schema in `@siteops/shared`, used by both the browser form and the API
pipe. Never validate the same thing twice in two ways.

**Layering** — business logic lives in services. If a rule cannot be called from the worker, which
has no HTTP layer, it is in the wrong place.

**Tenancy** — every organization-scoped query takes `organizationId`. Never trust it from the
client; resolve membership from the session first.

**Comments** — explain decisions, security reasoning, and non-obvious edge cases. Do not narrate
what the code already says.

**Dead code** — delete it. No unused files, abandoned components, commented-out implementations or
placeholder pages for unbuilt features.

## Definition of done

A feature is done when the implementation works end to end, validation and authorization exist,
errors, loading and empty states are handled, it is responsive and accessible, tests cover the
important behaviour, format/lint/typecheck/test/build all pass, documentation is updated, and the
change is committed and pushed.

Code existing is not the same as a feature being done.
