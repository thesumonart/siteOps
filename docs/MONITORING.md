# Monitoring

How a website goes from "added" to "you have an email saying it is down", and why each step exists.

## Pipeline

```text
Scheduler          finds websites whose nextCheckAt has passed
    ↓
Lease              claims each one atomically, so two workers cannot double-check it
    ↓
HTTP checker       resolves DNS, validates the address, requests, measures
    ↓
Result processor   writes the check, updates consecutive counters
    ↓
Incident service   confirms an outage or a recovery
    ↓
Notification       one email per incident transition, never more
```

## Scheduling without a queue

The worker claims work with a single atomic `findOneAndUpdate`:

```text
find:   monitoringEnabled = true
        nextCheckAt      <= now
        leaseExpiresAt    = null OR <= now
update: leaseExpiresAt    = now + leaseDuration
```

Because the find and the update are one operation, two workers cannot claim the same website. The
lease **expires**, so a worker that crashes mid-check does not strand a site forever — the next
worker reclaims it once the lease lapses.

This runs on free-tier infrastructure with no Redis. The interface is narrow enough that BullMQ can
be introduced behind it when check volume justifies the cost, without touching the checker, the
incident rules or the notification logic.

Concurrency is bounded by `MONITOR_CONCURRENCY`. Unbounded outbound requests would exhaust sockets
and memory long before they'd go faster.

## The check

Each check records:

| Field            | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `status`         | `up`, `down`, `timeout` or `error`                                    |
| `statusCode`     | Null when no response was received                                    |
| `responseTimeMs` | Wall clock to the final response                                      |
| `checkedAt`      | UTC                                                                   |
| `errorType`      | A closed union, so the UI can explain a failure without parsing prose |
| `errorMessage`   | Truncated                                                             |
| `redirectCount`  | Hops followed                                                         |

HTTP `2xx` and `3xx` count as up. Redirects are followed up to `MONITOR_MAX_REDIRECTS`, and
**every hop is re-validated against the SSRF address rules** — a public URL that redirects to a
metadata endpoint is refused mid-chain. See [SECURITY.md](SECURITY.md).

A check may retry within one scheduled attempt, up to `MONITOR_MAX_ATTEMPTS`. It never retries
forever.

## Confirming an outage

**A website is never declared down on one failed request.** A single dropped packet or a brief DNS
hiccup is not an outage, and alerting on one destroys trust in every later alert.

```text
Check 1 → fail    consecutiveFailures = 1
Check 2 → fail    consecutiveFailures = 2
Check 3 → fail    consecutiveFailures = 3  ≥ failureThreshold → incident opened
```

Recovery is symmetric, which prevents flapping:

```text
Check 4 → ok      consecutiveSuccesses = 1
Check 5 → ok      consecutiveSuccesses = 2  ≥ recoveryThreshold → incident resolved
```

Counters live on the website document, so reading state and claiming work are the same operation.
Defaults are `MONITOR_FAILURE_THRESHOLD=3` and `MONITOR_RECOVERY_THRESHOLD=2`, both overridable per
website.

## Incidents are idempotent

A monitoring job must be safe to run twice. Two mechanisms make that true:

1. **A unique partial index** on `incidents` allows at most one document with `status: 'open'` per
   website. Two workers racing on the same failing check produce a duplicate-key error, which is
   caught and treated as "the incident already exists" — never a second incident for one outage.
2. **Notification timestamps on the incident.** `downNotifiedAt` is set once, when the outage email
   is dispatched. A replayed job finds it already set and sends nothing.

Resolution sets `resolvedAt` and computes `durationSeconds` from the actual incident timestamps,
not from check counts.

## Notifications

```text
Outage confirmed  → one email to each member who wants outage alerts
Still down        → nothing
Still down        → nothing
Recovered         → one recovery email
```

Deduplication is enforced by a unique index on `notifications.dedupeKey`, a deterministic key
combining incident, event, recipient and channel. Delivery cannot be duplicated even if the job
runs twice.

Recipients are resolved from `notification_settings`, which is per user **per organization** — a
person can want alerts for one client's sites and not another's.

## Uptime

Uptime is `successfulChecks / totalChecks` over a window, from `@siteops/shared/uptime`.

It is **floored** to two decimals, never rounded up. A window with one failure in ten thousand
checks shows `99.99%`, not `100%`. Showing a perfect figure for a site that had a failure erodes
confidence in every other number on the page.

Response-time statistics **exclude failed checks**. A check that took thirty seconds to time out
measures how long a failure took, not how fast the site is; averaging it in would make a healthy
site look slow.

Downtime shown in analytics is estimated as `failedChecks × interval`, which is the best resolution
polling can offer. Incident pages show exact durations from incident timestamps, and those are the
authoritative figure.

The aggregation shape supports P50/P95/P99 later without a schema change.

## Configuration

Every parameter is an environment variable, validated at startup. No magic numbers in the code.

| Variable                          | Default | Meaning                                        |
| --------------------------------- | ------- | ---------------------------------------------- |
| `MONITOR_POLL_INTERVAL_SECONDS`   | 15      | How often the scheduler looks for due websites |
| `MONITOR_CONCURRENCY`             | 10      | Websites checked simultaneously                |
| `MONITOR_REQUEST_TIMEOUT_MS`      | 10000   | Per-request timeout                            |
| `MONITOR_MAX_REDIRECTS`           | 5       | Redirect hops, each re-validated               |
| `MONITOR_FAILURE_THRESHOLD`       | 3       | Consecutive failures before an outage          |
| `MONITOR_RECOVERY_THRESHOLD`      | 2       | Consecutive successes before resolution        |
| `MONITOR_MAX_ATTEMPTS`            | 2       | Attempts within one scheduled check            |
| `MONITOR_ALLOW_PRIVATE_ADDRESSES` | false   | **Tests only.** Refused in production          |

## Testing

Automated tests never touch real public websites — they would make the suite depend on someone
else's uptime. A controlled mock HTTP server covers `200`, `301`, `302`, `400`, `401`, `403`,
`404`, `500`, slow responses, timeouts, connection refused, DNS failure and redirect chains,
including chains that redirect into private address space.

## Observability

The worker emits structured events with stable names, so they can be filtered and counted:

```text
website.check.started      website.check.completed    website.check.failed
incident.created           incident.resolved
notification.sent          notification.failed
worker.started             worker.shutdown_started    worker.shutdown_complete
```

`/health` reports process liveness and performs no dependency I/O — a slow database must not
trigger a restart loop. `/ready` checks MongoDB and reports the last scheduler tick.
