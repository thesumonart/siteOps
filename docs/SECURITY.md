# Security

## Threat model

SiteOps accepts URLs from users and fetches them on a schedule from inside our infrastructure. That
single fact makes **SSRF the most serious risk in the product** — more serious than the usual
web-app concerns, because the attacker does not need an account compromise to abuse it, only the
ability to add a website.

The other standing risks are tenant crossing (reading another agency's client data) and credential
attacks against the sign-in form.

## SSRF defence

Two layers. **Neither is a fallback for the other** — they cover different attacks, and each is
the only defence against its own. Weakening either one opens a hole the other does not close.

### Layer 1 — URL validation, at creation time and on every redirect hop

`normalizeWebsiteUrl()` in `@siteops/shared` rejects, before anything is stored:

- any scheme other than `http:` and `https:` — `file:`, `ftp:`, `javascript:`, `data:`, `gopher:`
- embedded credentials (`https://user:pass@host`), which would otherwise be logged and emailed
- hostnames that are internal by definition: `localhost`, `*.local`, `*.internal`, `*.corp`,
  `*.lan`, `*.home.arpa`, `metadata.google.internal`, `instance-data`, `*.onion`
- single-label hostnames such as `intranet`, which resolve through a search domain
- IP literals in any non-public range, IPv4 and IPv6 alike

Notation tricks are handled by refusing to normalize them: `0177.0.0.1` and `127.1` are rejected as
malformed rather than parsed, because some resolvers read them as loopback while a naive blocklist
does not.

At creation time this is user feedback: it tells someone immediately that a URL cannot be
monitored. **On a redirect hop it is a security boundary**, and the only one that applies when the
hop target is an IP literal — see the note below. It is not sufficient on its own, because DNS can
change after the URL is stored.

### Layer 2 — address validation, at connection time

The authoritative check. Immediately before the worker opens a socket, the resolved IP address is
passed through `classifyIpAddress()`, and the connection proceeds only to an address that is
provably public unicast.

This is the layer that stops **DNS rebinding**: an attacker's domain may answer `93.184.216.34`
when the website is added and `169.254.169.254` an hour later, and the second answer is rejected at
connect time.

### Why neither layer is redundant

The guard in layer 2 is installed as the socket's `dns.lookup`. Node only consults a custom lookup
for a **hostname**: when the host is already an IP literal — `net.isIP()` is truthy — it connects
straight to it and the lookup function is never called. So a redirect to
`http://169.254.169.254/latest/meta-data/` reaches the metadata endpoint without layer 2 ever
seeing it.

What refuses that request is layer 1, re-run on the hop URL before the request is issued. That is
why the string validation runs on **every hop**, not only at creation, and why it must not be
relaxed to "we check the resolved IP anyway" — for an IP literal there is no resolution step to
check.

Conversely, layer 1 cannot see a hostname's resolved address, so it cannot stop rebinding. The
split is:

| Hop target                                  | Caught by                             |
| ------------------------------------------- | ------------------------------------- |
| IP literal in a blocked range               | Layer 1, per hop (layer 2 never runs) |
| Hostname that resolves to a blocked address | Layer 2, at connect time              |

A regression test covers the first row specifically: a mock server that 302s to
`169.254.169.254`. It was written because an earlier revision of the loopback test-mode exemption
let exactly that through.

### Blocked ranges

IPv4: `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT, which contains Alibaba's `100.100.100.200`
metadata endpoint), `127/8`, `169.254/16` (AWS, GCP and Azure metadata), `172.16/12`, `192.0.0/24`,
`192.0.2/24`, `192.88.99/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`,
`224/4`, `240/4`.

IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `100::/64`, `2001:db8::/32`. Addresses that
_carry_ an IPv4 address are unwrapped and judged by it: IPv4-mapped (`::ffff:127.0.0.1`),
IPv4-compatible, NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`). Zone indices are stripped, since
`fe80::1%eth0` is no more public than `fe80::1`.

Anything that does not parse as an IP address is blocked. The default is deny.

### Tests

`packages/shared/src/url/ip.test.ts` and `normalize.test.ts` assert every range above, plus the
notation bypasses. The worker's `address-guard.test.ts`, `safe-lookup.test.ts` and
`http-checker.test.ts` cover the connect-time guard and the redirect chain, including chains that
turn toward private address space mid-way.

`MONITOR_ALLOW_PRIVATE_ADDRESSES` exists so the integration suite can reach a mock server on
loopback, and the worker's environment schema **refuses to start in production** when it is set —
that refusal is itself unit-tested. The exemption it grants is deliberately narrow: it permits
loopback only, not the blocked ranges in general, so a redirect toward a metadata endpoint is
refused even in a test run.

## Tenant isolation

- Every organization-scoped document stores `organizationId`, and every repository method requires
  it as an argument. There is no query path that omits it.
- The organization id supplied by the client is treated as a hint. Membership is resolved from the
  session on every request before any data is read.
- A resource in another organization returns `404`, never `403`. Telling an attacker that an id
  exists but is not theirs is an enumeration oracle.
- Roles map to permissions in `@siteops/shared`; controllers check permissions, never role names,
  so a permission change happens in one file.

### Member management

- Nobody may grant a role above their own (`canAssignRole`), which is the escalation path that
  matters: without it an admin could invite or promote an owner and take over the tenant.
- Peers _can_ manage each other (`canActOn` compares ranks with `>=`). Requiring a strictly higher
  rank would make an organization with two owners unmanageable — neither could ever remove the
  other.
- Nobody may change their own role, so an owner cannot accidentally lock themselves out and an
  admin cannot self-promote.
- An organization must always keep one owner. Demoting or removing the last one is refused with
  `CANNOT_REMOVE_LAST_OWNER`, because the alternative is a tenant nobody can administer.
- Invitation tokens are 32 random bytes, emailed once and stored only as a SHA-256 hash — a leaked
  database yields no working links. Accepting one requires _both_ the token and a session for the
  address it was sent to, checked in constant time, so a forwarded link is useless to anyone else.
  Tokens are single-use and expire after seven days.

## Authentication

Password hashing and session management are handled by Better Auth, not by hand. Sessions are
opaque tokens in `HttpOnly`, `Secure`, `SameSite=Lax` cookies — never in `localStorage`, where any
XSS would read them.

- Passwords: minimum 12 characters. No character-class rule; it pushes people toward `P@ssw0rd!`
  without adding entropy.
- Email verification and password reset use single-use, expiring tokens.
- Changing a password invalidates other sessions.
- Sign-in failures are reported identically whether or not the account exists, and a password-reset
  request answers the same way for an unknown address.
- Better Auth checks for a duplicate email before inserting, which is not atomic. A unique index on
  `user.email` (applied by `indexes:sync`, see `packages/database/src/auth-indexes.ts`) makes two
  concurrent sign-ups for one address impossible at the storage layer.
- The upstream error message is never forwarded to the client. Codes are translated to the
  documented set and the wording is ours, so an unmapped internal failure cannot leak a driver
  error or a connection string.

## Rate limiting

Applied globally by `RateLimitGuard`, keyed by client address **and** route, so exhausting the
sign-in budget does not lock the same client out of the dashboard. Authentication routes carry a
much tighter budget than reads.

**Known limitation:** counters are per-process. With _n_ API instances the effective limit is
_n_ × the configured value. This is accepted for the initial single-instance deployment and
documented in the limiter's own source. Moving to a shared store means re-implementing
`RateLimiter` — the guard and every call site stay as they are.

## Transport and headers

`helmet` sets `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`
and, in production, HSTS. The API serves JSON only, so its CSP is `default-src 'none'`.

CORS uses an explicit origin allowlist and never reflects the request origin, because these
requests carry credentials.

## Error handling

`AllExceptionsFilter` is the only thing that writes an error response. Stack traces, driver errors,
file paths and connection strings are logged server-side and replaced with a generic message and a
stable error code. Validation errors are the one exception: they name the offending field, because
the user needs to know which one.

## Logging

Redaction is configured on the logger, not left to call sites: cookies, `authorization` headers,
`password`, `token`, `secret`, `MONGODB_URI`, `AUTH_SECRET` and `RESEND_API_KEY` are censored
before anything is written. Request paths are logged without their query string, since verification
and reset tokens travel there.

## Secrets

Only `.env.example` is committed. Every variable is validated at startup by a Zod schema, and a
missing or malformed required value stops the process rather than letting it run misconfigured.
Production additionally requires `https` for `APP_URL` (session cookies are `Secure`-only) and a
mail provider (an outage nobody is told about is not monitoring).

Nothing secret is exposed to the browser. Only `NEXT_PUBLIC_*` variables reach the client bundle,
and an ESLint rule blocks direct `process.env` access outside the env modules.

## Reporting

This is a private project. Security issues go to the repository owner.
