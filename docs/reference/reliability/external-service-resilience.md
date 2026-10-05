# External service resilience

Outbound HTTP to Stripe, Resend, and S3 uses a **Redis-backed circuit breaker** ([`circuit-breaker.ts`](../../../src/infrastructure/resilience/circuit-breaker.ts)) shared across API replicas. State changes are logged and reported to Sentry via `captureMessage`.

Notify **outbound webhooks** (customer URLs) use a separate **in-memory** [opossum](https://github.com/nodeshift/opossum) circuit per destination webhook in [`webhook-outbound-circuit.ts`](../../../src/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-outbound-circuit.ts) — not cluster-wide. Breakers are cached in a bounded LRU+TTL map keyed by webhook public id (cap 5,000, idle TTL 1h), so URL churn and multi-tenant growth cannot leak breakers and a URL update reuses the same breaker rather than orphaning it. The public id rather than the bigserial, so a webhook created after an id restart (`TRUNCATE ... RESTART IDENTITY`, a database restore) cannot inherit another webhook's open breaker.

---

## Coverage matrix

| Integration | Wrapped | Not wrapped (by design) |
| ----------- | ------- | ------------------------ |
| **Stripe** | All SDK calls in [`stripe.client.ts`](../../../src/infrastructure/payment/stripe.client.ts) except webhook HMAC | `constructStripeWebhookEvent` (local signature verify) |
| **Resend** | `sendEmail` in [`mail.service.ts`](../../../src/infrastructure/mail/mail.service.ts) | — |
| **S3** | every call in [`s3-adapter.ts`](../../../src/infrastructure/storage/s3-adapter.ts), the one implementation of `ObjectStoragePort` (a 4xx answer to one request — 404, 412, 416 — does not count against the circuit: `countsS3ErrorAsCircuitFailure`) | `createPresignedUploadUrl` (local signing only) |
| **Notify webhooks** | `fetchWebhookWithCircuitBreaker` (opossum, per process) | — |

OAuth provider `fetch` calls (Google/GitHub) are **not** circuit-wrapped today.

---

## External calls and database transactions

HTTP handlers do **not** pin a Postgres checkout for the full request: each unit of work holds one only inside its `withAppDatabaseContext`. Still avoid awaiting Stripe / S3 / Resend inside `withAppDatabaseContext` / `withTransaction` callbacks — network latency should not run while a DB transaction is open.

**CI guard:** `pnpm test:global` runs [`rls-context-network-isolation.global.test.ts`](../../../src/tests/global/rls-context-network-isolation.global.test.ts) — fails when outbound network calls appear inside database context callbacks under `src/domains/`.

**Pattern:** resolve provider state first (or after DB writes), then call external APIs outside the scoped DB wrapper. Subscription create already calls `paymentProvider.createSubscription` before `repository.create`.

---

## How to verify (audit #9)

- **CI guard:** `pnpm test:global` runs [`external-sdk-coverage.global.test.ts`](../../../src/tests/global/external-sdk-coverage.global.test.ts) — fails if `stripe`, `resend`, or `@aws-sdk/client-s3` are imported outside the four infrastructure wrapper modules (type-only `stripe` imports elsewhere are allowed).
- **Editor guard:** ESLint `no-restricted-imports` mirrors the same allowlist under `src/` (excluding tests and scripts).
- **Contract / chaos:** `pnpm test:contract` resets breaker state between specs; `pnpm test:chaos` includes Redis-partition circuit behavior.

---

## Thresholds (Redis-backed breakers)

| Circuit | `failureThreshold` | `resetTimeoutMs` |
| ------- | ------------------ | ---------------- |
| `stripe` | 5 | 30_000 |
| `s3` | 3 | 15_000 |
| `resend` | 5 | 60_000 |

When Redis is unavailable, breakers fall back to in-memory state per process.

**What counts as a failure.** Every error an operation throws counts against its circuit, except one that carries `countsAsCircuitFailure: false` ([`countsAsCircuitFailure`](../../../src/infrastructure/resilience/circuit-breaker.ts)) — the dependency answered and refused that one request. Such a call counts as a success, so a burst of bad requests can neither open a circuit nor keep a half-open one from closing. Our own error classes set the property (a Resend per-email rejection on `ResendApiError`, below); for a third-party error, `outboundCall`'s `countsAsCircuitFailure` option tags it. Every Stripe call passes [`countsStripeErrorAsCircuitFailure`](../../../src/infrastructure/payment/stripe.client.ts): a declined card, an invalid or not-found request (`resource_missing`) and an idempotency-key conflict do not count; outages, timeouts, connection, authentication and permission errors and rate limits do. Every S3 error still counts.

---

## Mail worker and Resend

- BullMQ mail jobs: **8 attempts** with **custom backoff** ([`mail.queue.ts`](../../../src/infrastructure/mail/queues/mail.queue.ts), [`mail-backoff.util.ts`](../../../src/infrastructure/mail/queues/mail-backoff.util.ts)): exponential from 5s for transport errors; **`CircuitBreakerOpenError.retryAfterMs`** (~remaining Resend circuit reset, up to 60s) when the cluster-wide Resend circuit is OPEN.
- `sendEmail` wraps the Resend HTTP call in `resendCircuit.execute()` plus bounded transient retries ([`retry-with-backoff.util.ts`](../../../src/infrastructure/resilience/retry-with-backoff.util.ts)); throws `CircuitBreakerOpenError` when the circuit is OPEN.
- On send failure before the final attempt, the outbox row is released to `pending` ([`releaseMailOutboxClaim`](../../../src/infrastructure/mail/mail-outbox.repository.ts)). The final attempt marks `failed` only for **non** circuit-open errors; circuit-open on the last attempt still releases the claim (job may retry via BullMQ backoff without marking the outbox failed).
- A Resend **per-email rejection** — a 422 about the email itself (`validation_error`, `missing_required_field`, `invalid_attachment`, `invalid_parameter`) or a 409 `invalid_idempotent_request` — does not count against the `resend` circuit and is not retried: the worker marks the outbox row `failed` on the first attempt and completes the job as `rejected` (`mail.worker.rejected`), so it never reaches the DLQ; the failed row is the record. Account and configuration errors (API key, unverified sender domain, quota) and Resend outages keep counting against the circuit and retrying.
- After exhausted retries, jobs may land on the `mail-dlq` queue (see [dlq-runbook.md](../../process/dlq-runbook.md)).

## Stripe webhook worker

- Queue uses custom backoff ([`stripe-webhook-backoff.util.ts`](../../../src/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook-backoff.util.ts)): exponential from 10s for API errors; `CircuitBreakerOpenError.retryAfterMs` when the Stripe circuit is OPEN (30s reset).

---

## Stripe webhook ingress

HTTP signature verification runs in [`stripe-webhook-ingress.plugin.ts`](../../../src/domains/billing/sub-domains/stripe-webhook/stripe-webhook-ingress.plugin.ts) before the controller — not in the service layer. The async worker re-fetches events via the Stripe API (`STRIPE_SECRET_KEY`), not webhook HMAC.

---

## Related

- [billing-database-schema.md](../data/billing-database-schema.md) — billing PK / FK / RLS
- [redis-topology.md](../../deployment/runbooks/redis-topology.md)
- [resource-limits.md](../../deployment/runbooks/resource-limits.md)
- [`src/infrastructure/resilience/resilience.overview.md`](../../../src/infrastructure/resilience/resilience.overview.md) — circuit breaker module overview, design decisions, tuning parameters
- [`src/infrastructure/payment/payment.overview.md`](../../../src/infrastructure/payment/payment.overview.md) — Stripe client wrapper invariants
- [`src/POLICIES.md`](../../../src/POLICIES.md) — circuit breaker thresholds and reset timeouts
