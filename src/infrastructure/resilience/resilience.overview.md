`src/infrastructure/resilience/`

# Resilience infrastructure

## Purpose

Cross-cutting reliability primitives that don't belong to any single domain: the cluster-wide circuit
breaker (`circuit-breaker.ts`) and retry-with-jitter (`retry-with-backoff.util.ts`). Third-party calls
reach them through `outboundCall` in [src/infrastructure/outbound/](src/infrastructure/outbound/),
which adds the per-attempt timeout and the error classification.

## Design decisions

- **One Redis-backed breaker per upstream, shared by every instance**: `stripeCircuit`, `s3Circuit`,
  `resendCircuit` and `turnstileCircuit` keep their state in Redis and mutate it with a Lua script
  (`lua/circuit-mutate.lua`), so a failing upstream opens the circuit for the whole cluster at once
  rather than per process.
- **Consecutive failures open it**: any success resets the count. Thresholds and reset windows are
  constants in `circuit-breaker.ts` (Stripe 5 / 30 s, S3 3 / 15 s, Resend 5 / 60 s, Meta 5 / 60 s, Anthropic 5 / 60 s, Turnstile 5 / 30 s);
  half-open lets up to two probe failures through before re-opening.
- **A refusal is not a failure**: an error the upstream answered on purpose (a declined card, a missing
  object, a rejected email) carries `countsAsCircuitFailure: false` and counts as a success, so a burst
  of bad requests can never open the circuit for everyone.
- **Jitter on retry**: every queue backoff and `retryWithBackoff` adds up to 20% random jitter
  (`addRetryJitter`) so a brief outage doesn't end in a synchronized retry storm.
- **Timeouts are explicit and per attempt**: `outboundCall` gives every attempt its own timeout signal;
  the Node fetch default (no timeout) is never relied on.
- **Customer webhooks are different**: they use a per-process [`opossum`](https://nodeshift.dev/opossum/)
  breaker per destination (`webhook-outbound-circuit.ts`), because one customer's endpoint failing must
  not affect any other destination.

## Operational concerns

- **Open circuit at the edge**: `CircuitBreakerOpenError` answers **503** with `Retry-After` (seconds
  until the half-open probe) — the request is retryable, never a 500.
- **Open circuit in a worker**: a queue whose every job calls one provider (`mail`, `stripe-webhook`,
  `subscription-seat-sync`, `user-data-export`, `contact-message-delivery`, `patient-ideas`) pauses on every replica for five minutes and parks the
  job without spending an attempt; the next job after the pause is the half-open probe
  (`createProviderPausableWorker`, `src/infrastructure/queue/worker-runtime/provider-outage-pause.util.ts`).

## Failure modes

- **Breaker open** → calls fail fast with `CircuitBreakerOpenError`; HTTP answers 503 + `Retry-After`.
- **Breaker half-open and probes fail** → re-opens for another reset window.
- **Upstream refuses one request** (`countsAsCircuitFailure: false`) → counted as a success: the
  upstream answered, so the breaker neither opens on a burst of bad requests nor stays half-open.
- **Redis unavailable** → the breaker keeps that circuit's state in-process for the call (a warning plus
  `circuit.mutate.fallback_local_count`) instead of failing the request.
