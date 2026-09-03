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
forever, and it never retries a **deterministic** rejection: a blocked target or an invalid URL
fails identically every time, so a second attempt only delays the result.

This is a different layer of noise absorption from the failure threshold below. The threshold
tolerates a bad check now and then across many minutes; the retry tolerates a check that simply had
a rough moment right now.

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

While an incident is open, the website reads as `down` even on a check that succeeded. The first
good response after an outage is not yet a recovery — it is one data point toward one. Showing
"up" at that moment and "down" again on the next failure is the flapping the threshold exists to
prevent. A site that has failed once but not yet reached the threshold reads as `degraded`.

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

Dispatch is idempotent at two levels. The incident-level flag (`downNotifiedAt`,
`recoveryNotifiedAt`) is claimed with a conditional update, so a job that runs twice does no work
the second time. Within a single dispatch, each recipient's notification carries a deterministic
`dedupeKey` of `incidentId:event:userId`, and the unique index on it makes a duplicate insert
impossible rather than merely unlikely.

Recipients are every member of the owning organization whose email is verified, minus anyone who
has turned that event off in `notification_settings` — which is per user **per organization**, so a
person can want alerts for one client's sites and not another's. A member with no stored preference
is notified: silently skipping an outage alert is worse than one extra email.

A delivery failure is **recorded, not hidden**. The notification row is stored with
`status: 'failed'` and the provider's reason, and the incident stays resolved regardless — a failed
alert email must never roll back the outage that triggered it.

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
`404`, `500`, slow responses, timeouts, connection refused, connection reset, DNS failure and
redirect chains, including chains that redirect into private address space.

Two guarantees cannot be proven against a mock, because the guarantee _is_ a database index:
at most one open incident per website, and at most one notification per incident, event and
recipient. Those run against a real MongoDB replica set and race concurrent writers against each
other. They are the reason `MONGODB_URI` is required in CI.

The decision logic itself — counters, thresholds, transitions, displayed status — is a pure module
with no I/O, so every boundary condition is covered without a database or a network at all.

## Observability

The worker emits structured events with stable names, so they can be filtered and counted:

```text
scheduler.tick_claimed          scheduler.tick_failed         scheduler.release_failed
website.check.completed         website.check.pipeline_failed
incident.created                incident.resolved             incident.open_race_detected
notification.delivery_failed    notification.down_dispatch_failed
                                notification.recovery_dispatch_failed
email.sent                      email.failed                  email.not_configured
worker.started                  worker.shutdown_started       worker.shutdown_complete
```

`incident.open_race_detected` is not an error. It is the unique index doing its job: two workers
reached the same failing website at once, one lost the insert, and the loser adopted the winner's
incident instead of creating a second one.

`/health` reports process liveness and performs no dependency I/O — a slow database must not
trigger a restart loop. `/ready` checks MongoDB and reports the last scheduler tick.
