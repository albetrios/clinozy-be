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
- **Editor guard:** Biome's `noRestrictedImports` (`biome.json`) mirrors the same allowlist under `src/` (excluding tests and scripts).
- **Contract / chaos:** `pnpm test:contract` resets breaker state between specs; `pnpm test:chaos` includes Redis-partition circuit behavior.

---

## Thresholds (Redis-backed breakers)

| Circuit | `failureThreshold` | `resetTimeoutMs` |
| ------- | ------------------ | ---------------- |
| `stripe` | 5 | 30_000 |
| `s3` | 3 | 15_000 |
| `resend` | 5 | 60_000 |
| `meta` | 5 | 60_000 |
| `anthropic` | 5 | 60_000 |

When Redis is unavailable, breakers fall back to in-memory state per process.

**What counts as a failure.** Every error an operation throws counts against its circuit, except one that carries `countsAsCircuitFailure: false` ([`countsAsCircuitFailure`](../../../src/infrastructure/resilience/circuit-breaker.ts)) — the dependency answered and refused that one request. Such a call counts as a success, so a burst of bad requests can neither open a circuit nor keep a half-open one from closing. Our own error classes set the property (a Resend per-email rejection on `ResendApiError`, below); for a third-party error, `outboundCall`'s `countsAsCircuitFailure` option tags it. Every Stripe call passes [`countsStripeErrorAsCircuitFailure`](../../../src/infrastructure/payment/stripe.client.ts): a declined card, an invalid or not-found request (`resource_missing`) and an idempotency-key conflict do not count; outages, timeouts, connection, authentication and permission errors and rate limits do. Every S3 error still counts. Meta (`countsMetaGraphErrorAsCircuitFailure`) and Anthropic (`countsAnthropicErrorAsCircuitFailure`, launch D80) do not count a throttle (Anthropic: 429 or 529 overloaded) or a refusal of one request (a 4xx other than 401 / 403); a bad key, a 5xx, a timeout and a network failure do.

---

## Mail worker and Resend

- **Paced to Resend's rate limit.** The `mail` worker's BullMQ limiter caps sends at `RESEND_MAX_REQUESTS_PER_SECOND` (default 10 — Resend's per-team limit) across every replica, so a burst is spread out instead of rejected. A 429 `rate_limit_exceeded` that still arrives (another environment sending through the same team) is a **throttle**, not an outage: it does not count against the `resend` circuit (`ResendApiError.isRateLimited`), the outbox claim is released, and the queue pauses for Resend's `Retry-After` — seconds — without spending the job's attempt. The daily and monthly quota 429s do count: they last until the quota resets.
- **Two lanes.** Notification fan-out is enqueued `bulk` (BullMQ priority); sign-in codes, password resets and invitations go `transactional` (no priority) and BullMQ always takes them first — a broadcast to an organization cannot hold a sign-in code behind it.
- **Resend outage → the mail queue pauses.** While Resend is down (its circuit is open, or a send failure leaves it open or half-open) the whole `mail` queue pauses on every replica for five minutes, the failed job is parked without spending an attempt, and the next job after the pause is the probe — see [workers-and-events.md → Provider outage pause](../runtime/workers-and-events.md#provider-outage-pause). Emails wait for Resend however long the outage lasts, then all go out.
- BullMQ mail jobs: **8 attempts** with **custom backoff** ([`mail.queue.ts`](../../../src/infrastructure/mail/queues/mail.queue.ts), [`mail-backoff.util.ts`](../../../src/infrastructure/mail/queues/mail-backoff.util.ts)), exponential from 5s, for send errors that are not an outage. The backoff's circuit branch (`CircuitBreakerOpenError.retryAfterMs`) only covers a job whose pause could not be applied.
- `sendEmail` wraps the Resend HTTP call in `resendCircuit.execute()` plus bounded transient retries ([`retry-with-backoff.util.ts`](../../../src/infrastructure/resilience/retry-with-backoff.util.ts)); throws `CircuitBreakerOpenError` when the circuit is OPEN.
- On send failure before the final attempt, the outbox row is released to `pending` ([`releaseMailOutboxClaim`](../../../src/infrastructure/mail/mail-outbox.repository.ts)). The final attempt marks `failed` only for an error that is not an outage; a Resend outage releases the claim on any attempt (`ProviderOutageError`), so the row is never failed — nor its body scrubbed — because Resend was down.
- One live job per outbox row: `enqueueMailOutboxJob` deduplicates on the row's token (BullMQ `deduplication`), so the outbox sweeper re-enqueueing a row on every pass of a long outage adds no second job.
- A Resend **per-email rejection** — a 422 about the email itself (`validation_error`, `missing_required_field`, `invalid_attachment`, `invalid_parameter`) or a 409 `invalid_idempotent_request` — does not count against the `resend` circuit and is not retried: the worker marks the outbox row `failed` on the first attempt and completes the job as `rejected` (`mail.worker.rejected`), so it never reaches the DLQ; the failed row is the record. Account and configuration errors (API key, unverified sender domain, quota) and Resend outages keep counting against the circuit and retrying.
- After exhausted retries, jobs may land on the `mail-dlq` queue (see [dlq-runbook.md](../../process/dlq-runbook.md)).

## Stripe webhook worker

- **Stripe outage → the queue pauses.** `stripe-webhook` and `subscription-seat-sync` pause on every replica while Stripe is down, probing every five minutes, without spending attempts ([Provider outage pause](../runtime/workers-and-events.md#provider-outage-pause)). One live job per event: the ingress and reclaim adds deduplicate on the event id, so reclaim sweeps during the outage add nothing.
- Queue uses custom backoff ([`stripe-webhook-backoff.util.ts`](../../../src/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook-backoff.util.ts)): exponential from 10s for API errors that are not an outage; its `CircuitBreakerOpenError.retryAfterMs` branch only covers a job whose pause could not be applied.

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
