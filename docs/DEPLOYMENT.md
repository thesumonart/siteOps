# Deployment

Three deployable units and one database. The target is a setup that costs nothing or close to it
to run, without weakening security to get there.

```text
Vercel            →  apps/web      Next.js
Container host    →  apps/api      NestJS
Container host    →  apps/worker   Monitoring worker
MongoDB Atlas     →  database      Free tier (M0) is enough to start
```

No Kubernetes, no queue infrastructure, no service mesh. See
[ARCHITECTURE.md](ARCHITECTURE.md) for why.

## Order

1. Create the MongoDB Atlas cluster and get a connection string.
2. Run the index sync, before anything writes to the database.
3. Deploy the API. Note its public URL.
4. Deploy the worker with the same database.
5. Deploy the web app pointing at the API URL.
6. Verify: `indexes:verify`, both health endpoints, and a real sign-up.

## MongoDB Atlas

The free M0 tier is a replica set, which is what a production deployment wants for failover.
SiteOps itself uses no transactions — its correctness guarantees are unique indexes, not
multi-document atomicity — so a standalone works too, which is why CI runs against one.

- Create a database user with **read/write on the SiteOps database only**, not cluster admin.
- Restrict network access to the hosting platform's egress addresses where the platform publishes
  them. Where it does not, use a strong generated password and rotate it on any suspicion.
- Connection strings contain credentials — they belong in the platform's secret store, never in the
  repository.

Connections, not storage, are the binding constraint on M0. The API and worker each hold their own
pool; keep `MONGODB_MAX_POOL_SIZE` modest (10 and 5 are the defaults) and their sum under the
cluster limit.

## Indexes

Index builds are an explicit step, run before the code that needs them, because a build issued by
a starting process can stall a live cluster:

```bash
MONGODB_URI="mongodb+srv://..." pnpm --filter @siteops/database indexes:sync
```

This is not optional housekeeping. Without these indexes the database enforces none of the
uniqueness the product depends on: a website could be monitored twice, an outage could open two
incidents, and one incident could send the same alert email repeatedly. Application code does not
re-check any of that — the index _is_ the guarantee.

Nothing else will tell you if the step is skipped. Every request still succeeds and every page
still renders; only the guarantees quietly stop holding. So confirm it, read-only, after deploying:

```bash
MONGODB_URI="mongodb+srv://..." pnpm --filter @siteops/database indexes:verify
```

It names any missing index and exits non-zero. Indexes it does not recognise are reported but not
treated as a failure — one added by hand while diagnosing a slow query is a normal thing to find.

`MONGODB_AUTO_INDEX=true` runs the same sync at startup and is meant for development only. It does
not use Mongoose's own `autoIndex`, which silently does nothing here: models are compiled when
their module is imported, before the connection is opened, and command buffering is off, so the
automatic build never runs.

## Container image

One image builds both Node services; the command decides which runs. They share every dependency,
so a second image would be near-identical.

```bash
docker build -t siteops .
docker run siteops node apps/api/dist/main.js
docker run siteops node apps/worker/dist/main.js
```

It runs as the unprivileged `node` user, and neither process is wrapped in a shell, so `SIGTERM`
reaches it directly and the graceful-shutdown path runs.

**Known issue — image size.** `better-auth` declares `next`, `react` and `vitest` as optional peer
dependencies, for framework integrations SiteOps does not use. pnpm satisfies them from the web
app's copies, so the resolution is baked into the lockfile and `pnpm deploy` faithfully copies the
whole Next toolchain into the API's tree — several hundred megabytes the API never loads. The
worker, which does not depend on Better Auth, deploys at about 26 MB.

`resolvePeersFromWorkspaceRoot: false` does **not** fix this; it was tried. pnpm reads the setting,
but it governs only the root package's own dependencies, and here the peer is satisfied from
another workspace project. A real fix means either stopping the web app and the API sharing a
lockfile, or an upstream change to Better Auth's peer declarations. Nothing is broken meanwhile —
it costs build time and registry storage.

## API

Any container host will do — Railway, Render, Fly.io. The API is a plain Node process, whether run
from the image above or directly:

```bash
pnpm install --frozen-lockfile
pnpm --filter @siteops/api... build
node apps/api/dist/main.js
```

| Setting     | Value                              |
| ----------- | ---------------------------------- |
| Health      | `GET /health`                      |
| Readiness   | `GET /ready`                       |
| Port        | `PORT`, default 4000               |
| Stop signal | `SIGTERM` (shutdown hooks enabled) |

Set `TRUST_PROXY=true` **only** when the platform terminates TLS and sets `X-Forwarded-For`.
Enabling it without a proxy in front lets a client spoof its address and defeat rate limiting.

## Worker

Same host, separate process. It must not be scaled to multiple instances without reviewing lease
duration first — the lease is what stops two workers checking the same site, and it is sized for
the current single-instance deployment.

```bash
node apps/worker/dist/main.js
```

It listens on `WORKER_PORT` purely so platforms that require an open port do not treat it as
crashed. `/health` and `/ready` behave as they do for the API.

## Web

Vercel, with the repository root as the project root and `apps/web` as the app.

| Setting          | Value                                 |
| ---------------- | ------------------------------------- |
| Install command  | `pnpm install`                        |
| Build command    | `pnpm --filter @siteops/web... build` |
| Output directory | `apps/web/.next`                      |

A `.vercel.app` subdomain is fine to start; a custom domain is not required.

Only `NEXT_PUBLIC_*` variables reach the browser. Never put a secret in one.

## Environment variables

Every variable is validated at startup. A missing or malformed required value stops the process
rather than letting it run misconfigured. `.env.example` is the complete list.

### API

| Variable                     | Required | Notes                                     |
| ---------------------------- | -------- | ----------------------------------------- |
| `NODE_ENV`                   | yes      | `production`                              |
| `PORT`                       | no       | Platform usually sets it                  |
| `APP_URL`                    | yes      | Must be `https` in production             |
| `API_URL`                    | yes      | This service's public URL                 |
| `MONGODB_URI`                | yes      | Atlas connection string                   |
| `AUTH_SECRET`                | yes      | ≥ 32 chars, `openssl rand -base64 32`     |
| `RESEND_API_KEY`             | yes      | Required in production                    |
| `EMAIL_FROM`                 | no       | Verified sender                           |
| `COOKIE_DOMAIN`              | no       | Only if API and web share a parent domain |
| `ADDITIONAL_TRUSTED_ORIGINS` | no       | Extra CORS origins, comma-separated       |
| `TRUST_PROXY`                | no       | `true` only behind a real proxy           |
| `MONGODB_AUTO_INDEX`         | no       | Leave `false`; see Indexes above          |

### Worker

Shares `MONGODB_URI`, `APP_URL`, `RESEND_API_KEY` and `EMAIL_FROM`, plus the tuning variables in
[MONITORING.md](MONITORING.md).

`MONITOR_ALLOW_PRIVATE_ADDRESSES` disables SSRF address filtering and exists only for tests. The
worker **refuses to start in production** when it is set.

### Web

| Variable              | Notes             |
| --------------------- | ----------------- |
| `NEXT_PUBLIC_API_URL` | Public API origin |
| `NEXT_PUBLIC_APP_URL` | Public web origin |

## Cookies across origins

The API and the web app are on different hosts by default, so session cookies are third-party and
some browsers drop them. Two options:

1. **Same parent domain** (recommended) — `app.example.com` and `api.example.com`, with
   `COOKIE_DOMAIN=.example.com`. Cookies stay first-party.
2. **Proxy** — route `/api/*` from the web app to the API, making requests same-origin.

Until one of these is in place, sign-in works locally but may fail in production browsers with
strict third-party cookie policies.

## Operations

| Task                   | How                                                     |
| ---------------------- | ------------------------------------------------------- |
| Is the API healthy?    | `curl $API_URL/health`                                  |
| Can it serve?          | `curl $API_URL/ready`                                   |
| Is monitoring running? | `curl $WORKER_URL/ready` — check `lastTickAt` advances  |
| Are the guarantees on? | `pnpm --filter @siteops/database indexes:verify`        |
| Trace a failure        | Find `requestId` from the `X-Request-Id` header in logs |

Logs are newline-delimited JSON in production. Events use stable dotted names
(`website.check.completed`, `incident.created`) so they can be filtered and counted.

## Rollback

Deployments are stateless — redeploy the previous build. Schema changes are additive, so the
previous version keeps working against the current database. Never drop an index or a field as part
of a rollback.
