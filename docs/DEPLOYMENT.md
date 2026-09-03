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
2. Deploy the API. Note its public URL.
3. Deploy the worker with the same database.
4. Deploy the web app pointing at the API URL.
5. Run the index sync.
6. Verify health endpoints and a real sign-up.

## MongoDB Atlas

The free M0 tier is a replica set already, which is what the incident transactions need.

- Create a database user with **read/write on the SiteOps database only**, not cluster admin.
- Restrict network access to the hosting platform's egress addresses where the platform publishes
  them. Where it does not, use a strong generated password and rotate it on any suspicion.
- Connection strings contain credentials — they belong in the platform's secret store, never in the
  repository.

Connections, not storage, are the binding constraint on M0. The API and worker each hold their own
pool; keep `MONGODB_MAX_POOL_SIZE` modest (10 and 5 are the defaults) and their sum under the
cluster limit.

## Indexes

`autoIndex` is off in production, because an index build issued by a starting process can stall a
live cluster. Applying indexes is an explicit step, run before the code that needs them:

```bash
MONGODB_URI="mongodb+srv://..." pnpm --filter @siteops/database indexes:sync
```

## API

Any container host will do — Railway, Render, Fly.io. The API is a plain Node process.

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
| `MONGODB_AUTO_INDEX`         | no       | Leave `false`                             |

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
| Trace a failure        | Find `requestId` from the `X-Request-Id` header in logs |

Logs are newline-delimited JSON in production. Events use stable dotted names
(`website.check.completed`, `incident.created`) so they can be filtered and counted.

## Rollback

Deployments are stateless — redeploy the previous build. Schema changes are additive, so the
previous version keeps working against the current database. Never drop an index or a field as part
of a rollback.
