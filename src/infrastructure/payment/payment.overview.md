`src/infrastructure/payment/`

# Payment infrastructure

## Purpose

Stripe SDK client wrapper. Owns the singleton Stripe instance, the helpers for customer / subscription /
portal session creation, and the inbound webhook signature verification. Every Stripe call runs through
`outboundCall` behind the shared `stripe` circuit (see
[resilience.overview.md](src/infrastructure/resilience/resilience.overview.md)).

The billing **domain** ([src/domains/billing/](src/domains/billing/)) consumes this module and owns the
business logic; this module owns the network primitive.

## Design decisions

- **Stripe SDK `^23`**, with the API version pinned through the `apiVersion` option so an SDK upgrade
  doesn't change response shapes.
- **Errors keep their status meaning** (`stripe-error.util.ts`, `toClientFacingStripeError`): a declined
  card → 422 `payment_declined`, a missing Stripe resource → 409, a Stripe rate limit, API or connection
  error → 503 `paymentProviderUnavailable`; an open `stripe` circuit → 503 with `Retry-After`.
- **Network I/O outside RLS contexts**: callers must not invoke Stripe inside `withAppDatabaseContext`.
  Enforced by `pnpm test:global` (`rls-context-network-isolation.global.test.ts`) and called out as an
  invariant in
  [src/domains/billing/sub-domains/subscription/subscription.overview.md](src/domains/billing/sub-domains/subscription/subscription.overview.md).
- **Webhook signature verification is byte-precise**: the route in
  [src/domains/billing/sub-domains/stripe-webhook/](src/domains/billing/sub-domains/stripe-webhook/)
  captures the raw body so the SDK verifies against the exact bytes.
- **Idempotency key forwarding**: a mutating call forwards a key derived from the request's
  `X-Idempotency-Key` as Stripe's native `Idempotency-Key`.

## Operational concerns

- **Webhook secret rotation**: `STRIPE_WEBHOOK_SECRET` takes a comma-separated list; verification tries
  each secret in turn, so the old and new secret overlap during a rotation.
- **Stripe rate limits** (100 reads / 100 writes per second) answer 429, which counts as a circuit failure
  and reaches the client as 503.

## External dependencies

- **Stripe** API (`STRIPE_SECRET_KEY`).

## Tuning parameters

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (comma-separated for rotation),
  `STRIPE_WEBHOOK_TOLERANCE_SECONDS`, `STRIPE_HTTP_TIMEOUT_MS`.
- Circuit thresholds are constants in `circuit-breaker.ts` (no env knobs).

## Failure modes

- **Stripe API outage** → the circuit opens; user-facing calls answer 503 with `Retry-After`. Webhooks
  are processed when Stripe re-delivers.
- **Invalid webhook signature** → 400; Stripe retries.
