# SiteOps

**Monitor and manage every client website from one dashboard.**

SiteOps continuously checks the websites you add, confirms real outages before it alerts anyone,
and keeps the uptime history your clients ask about. It is built for freelancers, web developers
and agencies who look after more than one site.

---

## Status

Under active development. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is built and what is next.

| Area                        | State       |
| --------------------------- | ----------- |
| Monorepo, tooling, CI       | Done        |
| Shared domain + database    | Done        |
| API, worker, web foundation | Done        |
| Authentication              | Done        |
| Organizations and roles     | Done        |
| Website management          | Done        |
| Monitoring engine           | In progress |

## Requirements

| Tool    | Version | Notes                                  |
| ------- | ------- | -------------------------------------- |
| Node.js | 24.15.0 | Pinned in `.nvmrc`; run `nvm use`      |
| pnpm    | >= 11   | `corepack enable` or install globally  |
| Docker  | any     | Only for the local MongoDB replica set |

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy the environment template and fill it in
cp .env.example .env

# 3. Start MongoDB (single-node replica set, required for transactions)
pnpm docker:up

# 4. Create the database indexes
pnpm --filter @siteops/database indexes:sync

# 5. Run every app
pnpm dev
```

| App    | URL                   |
| ------ | --------------------- |
| Web    | http://localhost:3000 |
| API    | http://localhost:4000 |
| Worker | http://localhost:4001 |

`AUTH_SECRET` is the only value in `.env` you must change before anything works. Generate one with:

```bash
openssl rand -base64 32
```

## Commands

All commands run from the repository root.

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | Runs web, API and worker in watch mode        |
| `pnpm build`        | Builds every package and app                  |
| `pnpm lint`         | ESLint across the workspace                   |
| `pnpm typecheck`    | `tsc --noEmit` across the workspace           |
| `pnpm test`         | Unit and integration tests                    |
| `pnpm test:e2e`     | Playwright end-to-end tests                   |
| `pnpm format`       | Formats with Prettier                         |
| `pnpm format:check` | Fails if anything is unformatted (used by CI) |
| `pnpm clean`        | Removes build output and `node_modules`       |
| `pnpm docker:up`    | Starts local MongoDB                          |
| `pnpm docker:down`  | Stops local MongoDB                           |

## Repository layout

```text
siteops/
├── apps/
│   ├── web/        Next.js 16 dashboard (App Router)
│   ├── api/        NestJS REST API
│   └── worker/     Monitoring worker
├── packages/
│   ├── shared/     Domain types, Zod schemas, URL/IP validation, uptime math
│   ├── database/   Mongoose models, connection, indexes
│   └── config/     Shared ESLint and TypeScript configuration
└── docs/           Architecture, API, database, security, deployment
```

## Documentation

| Document                                | Covers                                           |
| --------------------------------------- | ------------------------------------------------ |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, module boundaries, decisions and why   |
| [DATABASE.md](docs/DATABASE.md)         | Collections, indexes and retention               |
| [SECURITY.md](docs/SECURITY.md)         | SSRF defence, tenant isolation, sessions, limits |
| [MONITORING.md](docs/MONITORING.md)     | How checks, incidents and notifications work     |
| [API.md](docs/API.md)                   | REST endpoints, envelopes and error codes        |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)     | Hosting, environment variables, operations       |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Workflow, conventions, definition of done        |
| [ROADMAP.md](docs/ROADMAP.md)           | Planned features, in order                       |

## Licence

Unlicensed and private.
