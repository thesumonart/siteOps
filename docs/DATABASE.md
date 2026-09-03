# Database

MongoDB via Mongoose. A **single-node replica set** is required even locally, because the incident
lifecycle uses multi-document transactions and MongoDB only offers those on a replica set.

## Collections

| Collection                           | Owner       | Growth                  | Notes                           |
| ------------------------------------ | ----------- | ----------------------- | ------------------------------- |
| `user`                               | Better Auth | one per person          | Read-only from application code |
| `session`, `account`, `verification` | Better Auth | —                       | Never touched directly          |
| `organizations`                      | SiteOps     | one per tenant          |                                 |
| `organization_members`               | SiteOps     | members × organizations |                                 |
| `websites`                           | SiteOps     | low                     | Also holds monitoring state     |
| `website_checks`                     | SiteOps     | **very high**           | Append-only, TTL-expired        |
| `incidents`                          | SiteOps     | low                     | At most one open per website    |
| `notifications`                      | SiteOps     | medium                  | Deduplicated by unique key      |
| `notification_settings`              | SiteOps     | members × organizations |                                 |
| `audit_logs`                         | SiteOps     | medium                  | Append-only, TTL-expired        |

`Subscription` and `Report` are deliberately absent; see [ARCHITECTURE.md](ARCHITECTURE.md).

### The auth collections

Better Auth owns `user`, `session`, `account` and `verification` through its own MongoDB adapter,
sharing the Mongoose connection's driver handle rather than opening a second pool — which matters
on the Atlas free tier, where connections are the binding constraint.

`UserModel` is a **read-only projection** over `user` so application code can render a members
table or address a notification. Writes go through Better Auth, so hashing and session
invalidation stay in one place.

## Indexes

Every index below exists for a named query. None were added speculatively.

### `organizations`

| Index           | Purpose              |
| --------------- | -------------------- |
| `slug` (unique) | Slugs appear in URLs |

### `organization_members`

| Index                             | Purpose                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `{organizationId, userId}` unique | One role per person per organization; makes a double invite a database error rather than a race |
| `{userId}`                        | "Which organizations am I in" — runs on every authenticated request                             |
| `{organizationId, joinedAt}`      | Members table                                                                                   |

### `websites`

| Index                                                | Purpose                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `{organizationId, createdAt: -1}`                    | Tenant-scoped list, paginated without an in-memory sort                                    |
| `{organizationId, canonicalKey}` unique              | One monitor per URL per organization; survives a double-submitted form                     |
| `{nextCheckAt}` partial on `monitoringEnabled: true` | The scheduler's hot query. The partial filter keeps paused sites out of the index entirely |
| `{organizationId, status}`                           | Dashboard status counters                                                                  |

### `invitations`

| Index                                                            | Purpose                                                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{organizationId, email}` unique, partial on `status: 'pending'` | One outstanding invitation per address; a re-invite refreshes the existing one instead of stacking duplicates. Accepted and revoked history is outside the constraint |
| `{tokenHash}`                                                    | Lookup when an invitation link is opened                                                                                                                              |
| `{organizationId, status, createdAt: -1}`                        | Pending invitations shown beside the members list                                                                                                                     |

### `website_checks`

| Index                                | Purpose                             |
| ------------------------------------ | ----------------------------------- |
| `{websiteId, checkedAt: -1}`         | Check history and uptime rollups    |
| `{websiteId, status, checkedAt: -1}` | The "errors only" filter            |
| `{organizationId, checkedAt: -1}`    | Organization-wide dashboard rollups |
| `{checkedAt}` TTL, 90 days           | Retention backstop                  |

### `incidents`

| Index                                             | Purpose                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{websiteId}` unique, partial on `status: 'open'` | **At most one open incident per website.** This is the deduplication guarantee — two workers racing on the same failing check produce a duplicate-key error, not two incidents |
| `{organizationId, startedAt: -1}`                 | Incident list                                                                                                                                                                  |
| `{organizationId, status, startedAt: -1}`         | Open-incident counter and filter                                                                                                                                               |
| `{websiteId, startedAt: -1}`                      | Incident history on a website page                                                                                                                                             |

### `notifications`

| Index                                     | Purpose                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `dedupeKey` unique                        | **Duplicate delivery is impossible**, even if the notification job runs twice |
| `{userId, organizationId, createdAt: -1}` | Notification feed                                                             |
| `{userId, readAt, createdAt: -1}`         | Unread badge, without scanning the feed                                       |

### `audit_logs`

| Index                             | Purpose       |
| --------------------------------- | ------------- |
| `{organizationId, createdAt: -1}` | Activity feed |
| `{createdAt}` TTL, 365 days       | Retention     |

## Correctness enforced by the database

Three guarantees are held by unique indexes rather than by application logic, so they survive
concurrency, retries and bugs:

1. **One open incident per website** — `incident_one_open_per_website`
2. **No duplicate notification** — `notification_dedupe_unique`
3. **No duplicate monitor for one URL in one organization** — `website_org_canonical_unique`

## Index management

`autoIndex` is **off** by default. An index build issued by a starting process can stall a live
cluster, so applying indexes is an explicit deployment step:

```bash
pnpm --filter @siteops/database indexes:sync
```

`MONGODB_AUTO_INDEX=true` is convenient locally and must stay false in production.

## Retention

Monitoring data is the collection that grows without bound: one website on a one-minute interval
writes about 525,600 documents a year.

| Data       | Retention                                    |
| ---------- | -------------------------------------------- |
| Raw checks | 30–90 days by plan; 90-day TTL as a backstop |
| Incidents  | Kept                                         |
| Audit logs | 365 days                                     |

Plan-specific windows (`PLAN_LIMITS[plan].checkRetentionDays`) are shorter than the TTL and are
applied by a retention job. The TTL guarantees that a failure of that job still cannot grow the
collection forever.

## Conventions

- Timestamps are stored in **UTC**. Conversion to a user's timezone happens in the browser.
- `website_checks` and `audit_logs` set `timestamps: false`; they carry their own `checkedAt` /
  `createdAt` and a second copy would be wasted bytes at this volume.
- Text fields have `maxlength`. An upstream error page must never become a large document.
- Identifiers from URLs and request bodies go through `toObjectId()`, which returns `null` on
  malformed input instead of throwing — an unhandled throw in a query builder turns a 404 into a 500. It also rejects arbitrary 12-character strings, which the driver would otherwise accept as
  valid ObjectIds.
