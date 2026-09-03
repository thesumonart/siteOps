# API

Base URL: `${API_URL}/api`. Health probes are the exception and live at the root: `/health`,
`/ready`.

Authentication is a session cookie. Requests are sent with credentials; there is no bearer token.

## Response envelope

Every response, success or failure, uses one of two shapes.

```jsonc
// Success
{ "success": true, "data": {} }
```

```jsonc
// Failure
{
  "success": false,
  "error": {
    "code": "WEBSITE_NOT_FOUND",
    "message": "Website not found.",
    // VALIDATION_ERROR only
    "fields": [{ "field": "url", "message": "Enter a valid URL." }],
  },
}
```

Clients branch on `code`, which is stable. `message` is for people and may be reworded.

Responses never contain stack traces, driver errors, internal paths or configuration values.

## Status codes

| Code | Used for                                                 |
| ---- | -------------------------------------------------------- |
| 200  | Read or update succeeded                                 |
| 201  | Resource created                                         |
| 204  | Deleted                                                  |
| 400  | Validation failed                                        |
| 401  | No valid session                                         |
| 403  | Authenticated, but not permitted — including plan limits |
| 404  | Not found **or** owned by another organization           |
| 409  | Conflicts with something that exists                     |
| 429  | Rate limited; see `Retry-After`                          |
| 500  | Unexpected failure                                       |
| 503  | A dependency is unavailable                              |

A resource belonging to another tenant returns `404`, never `403`. Confirming that an id exists but
belongs to someone else is an enumeration oracle.

## Error codes

| Code                                               | Meaning                                      |
| -------------------------------------------------- | -------------------------------------------- |
| `VALIDATION_ERROR`                                 | One or more fields are invalid; see `fields` |
| `UNAUTHENTICATED`                                  | Sign-in required                             |
| `FORBIDDEN`                                        | Not permitted                                |
| `NOT_FOUND`                                        | No such resource                             |
| `CONFLICT`                                         | Duplicate or conflicting state               |
| `RATE_LIMITED`                                     | Too many requests                            |
| `INTERNAL_ERROR`                                   | Unexpected failure                           |
| `SERVICE_UNAVAILABLE`                              | Dependency unavailable                       |
| `EMAIL_ALREADY_REGISTERED`                         | Registration with a known address            |
| `INVALID_CREDENTIALS`                              | Sign-in failed                               |
| `EMAIL_NOT_VERIFIED`                               | Verification required                        |
| `INVALID_TOKEN` / `TOKEN_EXPIRED`                  | Verification or reset link is unusable       |
| `ORGANIZATION_NOT_FOUND`                           | No such organization                         |
| `ORGANIZATION_SLUG_TAKEN`                          | Slug in use                                  |
| `NOT_A_MEMBER`                                     | Caller is not in the organization            |
| `INSUFFICIENT_ROLE`                                | Role lacks the permission                    |
| `CANNOT_REMOVE_LAST_OWNER`                         | An organization must keep one owner          |
| `MEMBER_NOT_FOUND` / `ALREADY_A_MEMBER`            | Membership operations                        |
| `WEBSITE_NOT_FOUND`                                | No such website in this organization         |
| `WEBSITE_URL_ALREADY_MONITORED`                    | The organization already monitors this URL   |
| `INVALID_WEBSITE_URL`                              | URL failed validation                        |
| `BLOCKED_WEBSITE_URL`                              | URL resolves to a non-public address         |
| `INCIDENT_NOT_FOUND` / `INCIDENT_ALREADY_RESOLVED` | Incident operations                          |
| `NOTIFICATION_NOT_FOUND`                           | No such notification                         |
| `PLAN_LIMIT_REACHED`                               | The plan limit would be exceeded             |

## Pagination

Never unbounded. Two styles, chosen per collection.

**Offset** — small collections where a total is useful (websites, members).

```text
?page=1&pageSize=20        pageSize max 100
```

```jsonc
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 42,
    "totalPages": 3,
    "hasNextPage": true,
  },
}
```

**Cursor** — high-volume append-only data (checks, incidents, notifications, audit logs), where
counting is wasteful and offsets drift as documents arrive.

```text
?cursor=<opaque>&pageSize=20
```

```jsonc
{ "items": [], "pagination": { "nextCursor": "...", "hasNextPage": true, "pageSize": 20 } }
```

The cursor is opaque and is never a raw database value. It encodes a timestamp **and** a document
id: the worker writes a whole batch of checks concurrently, so two documents can share a
millisecond, and a timestamp-only cursor would silently skip or repeat one of them. A malformed
cursor is rejected with `VALIDATION_ERROR` rather than being ignored — quietly restarting from the
newest page looks to the reader like a list that jumps to the top on its own.

## Endpoints

Authentication is handled by Better Auth under `/api/auth/*`: sign-up, sign-in, sign-out, email
verification, password reset and session.

| Method | Path                                   | Permission            |
| ------ | -------------------------------------- | --------------------- |
| GET    | `/session`                             | authenticated         |
| GET    | `/organizations`                       | authenticated         |
| POST   | `/organizations`                       | authenticated         |
| PATCH  | `/organizations/:id`                   | `organization:update` |
| GET    | `/organizations/:id/members`           | `member:read`         |
| POST   | `/organizations/:id/members`           | `member:invite`       |
| PATCH  | `/organizations/:id/members/:memberId` | `member:update_role`  |
| DELETE | `/organizations/:id/members/:memberId` | `member:remove`       |
| GET    | `/websites`                            | `website:read`        |
| POST   | `/websites`                            | `website:create`      |
| GET    | `/websites/:id`                        | `website:read`        |
| PATCH  | `/websites/:id`                        | `website:update`      |
| DELETE | `/websites/:id`                        | `website:delete`      |
| POST   | `/websites/:id/pause`                  | `monitoring:toggle`   |
| POST   | `/websites/:id/resume`                 | `monitoring:toggle`   |
| GET    | `/websites/:id/stats`                  | `monitoring:read`     |
| GET    | `/websites/:id/uptime`                 | `monitoring:read`     |
| GET    | `/websites/:id/checks`                 | `monitoring:read`     |
| GET    | `/incidents`                           | `incident:read`       |
| GET    | `/incidents/:id`                       | `incident:read`       |
| GET    | `/dashboard/stats`                     | `monitoring:read`     |
| GET    | `/notification-settings`               | `notification:read`   |
| PATCH  | `/notification-settings`               | `notification:update` |

Every endpoint above exists. Nothing is listed here before it is built — see
[ROADMAP.md](ROADMAP.md) for what is planned. An in-app notification feed and an audit-log endpoint
are both recorded in the database already but have no route yet.

### Monitoring reads

`/websites/:id/stats` and `/websites/:id/uptime` take `?range=24h|7d|30d`, defaulting to `24h`. The
range is a closed set rather than a pair of dates: an open-ended window would let a caller ask the
API to scan an organization's entire check history, which is the largest collection in the product.

`stats` returns the totals for the window; `uptime` returns the same figures grouped into buckets
for a chart, sized to keep any range to a readable number of points. **Periods with no checks are
absent rather than zero**, because a gap means monitoring was paused or the worker was down, and
reporting it as 0% uptime would invent an outage.

Uptime is `null`, never `100`, when nothing has been measured. `/incidents` accepts
`?status=open|resolved` and `?websiteId=`.

`GET /websites` returns each row with `uptimePercentage24h`, `averageResponseTimeMs24h` and
`openIncidentId` alongside the website itself, so the dashboard table needs one request rather than
one per row.

## Organization scope

Organization-scoped requests carry `X-Organization-Id`. It is a **hint, not an authorization**: the
API resolves the membership from the session and verifies the required permission before any query
runs.

## Rate limits

Applied per client address and per route. Responses carry `RateLimit-Limit`, `RateLimit-Remaining`
and `RateLimit-Reset`; a `429` also carries `Retry-After`. Authentication routes are limited far
more tightly than reads.

## Health

| Endpoint  | Checks dependencies | Meaning              |
| --------- | ------------------- | -------------------- |
| `/health` | No                  | The process is alive |
| `/ready`  | Yes                 | It can serve traffic |

`/health` performs no I/O deliberately: a slow database must not cause the platform to restart a
healthy API.
