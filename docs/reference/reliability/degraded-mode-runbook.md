# Degraded-mode runbook

How the API behaves when a runtime dependency (Redis, Cloudflare Turnstile) degrades, what
signals to alert on, and the operator response. These are deliberate **security-over-availability**
choices: the affected paths fail **closed** rather than silently dropping a safety guarantee.

See also: [external-service-resilience.md](external-service-resilience.md),
[observability-log-events.md](observability-log-events.md),
[../runtime/internationalization.md](../runtime/internationalization.md).

## Redis down → required-idempotency writes return `503`

**Behavior.** The idempotency middleware (`src/shared/middlewares/core/idempotency.middleware.ts`)
needs Redis to guarantee at-most-once execution. When Redis is unavailable it **fails closed**: the
write handler does not run and the request gets `503` with a `Retry-After` header and
`{ error: { code: 'service_unavailable', retryable: true } }`. Routes that require an
`X-Idempotency-Key` are therefore unavailable for writes during a Redis outage; idempotent retries by
well-behaved clients succeed once Redis recovers. (Reads, and writes without an idempotency key, are
unaffected by this gate.)

Rate limiting degrades **gracefully** instead — the limiter falls back to a per-process in-memory
counter (`rate-limit-fallback-store.ts`). Each process's hits are multiplied by
`resolveApiReplicaCount()` (`DEPLOYMENT_API_REPLICA_COUNT`, else `DEPLOYMENT_TOTAL_REPLICA_COUNT`,
else 1) before they are compared with `max`, so the cluster ceiling stays near `max` instead of
`max × replicas`. A budget smaller than the replica count cannot be split and stays per process.
The same store backs the per-organization request budget (`RATE_LIMIT_ORGANIZATION_MAX`, default
1000, over `RATE_LIMIT_WINDOW_MS`; lifted to 100000 when `RATE_LIMIT_RELAXED_CAPS` is set), which
runs after authentication and is skipped when the request has no organization. The permission cache
degrades to a direct DB lookup.

**Signals.**

- Log: `idempotency.cache.unavailable` (warn) — one per failed claim.
- Sentry: `idempotency.cache.unavailable` (error) — throttled to one event / 30s while degraded.
- Log: `rate_limit.redis_failover.local` (warn) — limiter running per-process.

**Operator response.** Restore Redis (managed-service failover / connectivity). No app change is
needed; the 503s clear automatically. Do **not** disable the idempotency gate to restore
availability — that reintroduces double-execution risk for writes.

## Cloudflare Turnstile down → captcha-gated auth fails closed

**Behavior.** In production the captcha pre-handler
(`src/shared/middlewares/security/captcha.middleware.ts`) fails **closed**: if Turnstile cannot
answer — network or timeout, a non-200 or unreadable siteverify response, or the `turnstile` circuit
breaker open — the request is rejected with **`503 captchaProviderUnavailable`** (with `Retry-After`
while the circuit is open). Captcha-gated routes — login, email verification-code, password-reset
request, MFA challenge, OAuth initiation — are therefore unavailable during a Turnstile outage, and
clients see a retryable 503 rather than a "bad captcha" 401. Fail-open (`CAPTCHA_FAIL_OPEN`) is
rejected by the env schema in production (it would invite credential stuffing during the outage); the
bypass header is honored only in non-production.

**Signals.**

- Sentry: `captcha.provider_unavailable` (error) — throttled to one event / 30s; `extra.reason` is
  `breaker_open` or `verify_error`. The 503s themselves are not Sentry events.
- A spike of `503` on public auth routes with `errors:captchaProviderUnavailable`, and
  `outbound.call.failed` logs for the `captcha-turnstile` integration.

**Operator response.** Confirm the Turnstile outage (Cloudflare status). Misconfiguration cannot
reach here — the env schema requires `CAPTCHA_PROVIDER=turnstile` and `CAPTCHA_SECRET` in
production, so a bad config fails at boot. For a confirmed third-party outage, communicate the auth
degradation; recovery is automatic when Turnstile returns and the circuit breaker closes.

## Quick reference

| Dependency down | Affected surface | Mode | Primary alert |
| --- | --- | --- | --- |
| Redis | writes that require `X-Idempotency-Key` | fail closed (`503` retryable) | `idempotency.cache.unavailable` (Sentry) |
| Redis | global, per-route, and per-organization rate limits | graceful (per-process counter, divided by replica count) | `rate_limit.redis_failover.local` (log) |
| Turnstile | captcha-gated auth routes | fail closed (`503`, `Retry-After` while the circuit is open) | `captcha.provider_unavailable` (Sentry) |
