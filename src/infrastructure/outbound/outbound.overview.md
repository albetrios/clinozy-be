`src/infrastructure/outbound/`

# Outbound HTTP infrastructure

## Purpose

The one way the app calls a third party: Stripe, S3, Resend, OAuth providers (Google, GitHub),
Cloudflare Turnstile. [`outboundCall`](src/infrastructure/outbound/outbound-call.ts) wraps any
operation with the integration's timeout, circuit breaker and optional retry;
[`outboundFetch` / `outboundFetchJson`](src/infrastructure/outbound/outbound-fetch.ts) are the HTTP
form of it. Customer webhook delivery has its own SSRF-guarded fetch
(`src/shared/utils/security/webhook-outbound-fetch.util.ts`).

## Design decisions

- **Per-integration defaults in one table**: [`outbound-defaults.ts`](src/infrastructure/outbound/outbound-defaults.ts)
  maps each `OutboundIntegrationName` to its timeout, its circuit and whether an error counts
  against the circuit. A new integration is a new entry — call sites do not pick timeouts.
- **Per-attempt timeout**: every attempt gets its own `AbortSignal.timeout`, so a retry after a
  timeout really runs (one shared signal used to abort every retry at once).
- **Refusals don't trip the circuit**: `countsAsCircuitFailure` lets the upstream refusing one
  request (a declined card, an S3 404/412) count as a success; outages, timeouts and 5xx count.
- **Read the body inside the call**: `outboundFetchJson` parses JSON under the same timeout and
  classification, so a hung body or an HTML maintenance page is an `ExternalServiceError`, never a
  raw `SyntaxError`/`TimeoutError` that would surface as a 500.
- **One error type at the edge**: everything that escapes is an
  [`ExternalServiceError`](src/infrastructure/outbound/outbound-error.ts) (an `AppError`, 503) with
  a coarse `category` (`timeout`, `network`, `circuit_open`, `http_4xx`, `http_5xx`, `aborted`,
  `unknown`) — except errors a caller asks to see raw (`rethrowIf`: Stripe's typed errors, Resend's)
  and an open circuit (`CircuitBreakerOpenError`, so workers can read `retryAfterMs`).
- **Client-facing status**: `toClientFacingOutboundError` maps what reaches the HTTP layer raw — an
  open circuit → 503 with `Retry-After`; a Stripe error → 422 / 409 / 503 — and the global error
  handler applies it. A 503 is logged at warn with its real message, never masked or sent to Sentry;
  the outage is alerted where it happens (the circuit opening).
- **Request-id propagation**: `outboundFetch` sends the originating `X-Request-Id`.

## Operational concerns

- **Who maps 4xx**: a provider refusing the request is the caller's decision — OAuth maps it to 401
  (`toOAuthProviderFailure`), Turnstile's verdict is a result, S3 404/412 are typed results
  (`S3HeadResult`, `ObjectCopyResult`). Anything else stays a 503.
- **Retries**: off by default; a call site opts in with `retry` (exponential backoff with jitter,
  inside one circuit `execute()` so retries do not multiply the failure count). Queue retries are
  BullMQ's, not this module's.
- **Redaction**: `redactOutboundHeaders` / `redactOutboundBody` strip secrets before anything is
  logged or sent to Sentry breadcrumbs.

## External dependencies

- Node global `fetch`; the Stripe, AWS and Resend SDKs run inside `outboundCall`.
- Redis-backed circuit breakers (`src/infrastructure/resilience/circuit-breaker.ts`), with a local
  fallback when Redis is unreachable.

## Failure modes

- **Timeout / network / 5xx / unreadable body** → `ExternalServiceError` (503 at the HTTP layer,
  retryable in workers via `isOutboundRetryable`).
- **Circuit open** → `CircuitBreakerOpenError` from `outboundCall` (an `ExternalServiceError` with
  `category: 'circuit_open'` from `outboundFetch`); the HTTP answer is 503 with `Retry-After`.
- **Upstream 4xx** → `ExternalServiceError` with `category: 'http_4xx'` and `status`; the caller
  decides whether it is the user's fault (401/409/422) or the provider's (503).
