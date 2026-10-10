`src/infrastructure/observability/`

# Observability infrastructure

## Purpose

The platform's instrumentation surface: Sentry (errors, traces, profiling, structured logs), W3C trace-context propagation across the job queue, idempotency-cardinality monitoring (bounded SCAN to detect Redis-key leaks), and the DLQ-depth + DB-pool alerting workers. This module owns the wiring; individual domains and infrastructure modules consume it through `Sentry.captureException()`, `logger.*`, etc.

## Design decisions

- **Sentry over alternatives**: chosen for the integrated error + tracing + profiling story, the breadcrumb model, and the seamless V8 CpuProfiler integration. Continuous profiling lets us find regressions without enabling profiling per-incident.
- **One tracing pipeline — Sentry's**: Sentry's SDK is built on OpenTelemetry and registers the global tracer, so there is no separate OpenTelemetry SDK or OTLP exporter (a second pipeline traced every request twice and had no backend reading it). `tracing/trace-context.util.ts` uses only `@opentelemetry/api`: `captureTraceContextForPropagation` puts `traceparent` / `tracestate` on every queued job and `runWithPropagatedTraceContext` re-enters it in the worker, so a worker span is a child of the request that queued it. To send traces to a second backend later, add an OTLP span processor to Sentry's OpenTelemetry setup (`openTelemetrySpanProcessors`) rather than a parallel SDK.
- **Structured logging via Pino + Sentry**: Pino emits JSON logs to stdout (collected by Railway / the cloud provider); Sentry receives a structured copy of `error`-level entries via the Sentry transport.
- **Idempotency cardinality sampling**: a bounded `SCAN` on the `<key prefix>idempotency:*` Redis keyspace runs on a schedule, logs the cardinality, and fires Sentry when a threshold is crossed. The point is to detect the "leak" failure mode where a bug strands keys past their TTL. The pattern goes through `buildPrefixedScanPattern` ([redis-scan.util.ts](src/infrastructure/cache/redis-scan.util.ts)): ioredis does not prefix a SCAN pattern, and the bare `idempotency:*` matched no key, so the sampler always counted 0.
- **DLQ depth alerts**: the [dlq-depth/](src/infrastructure/observability/dlq-depth/) worker polls every queue's DLQ count and emits Sentry warnings when depth exceeds a threshold, so on-call sees the queue health independently of any single failed job.
- **Redis saturation + queue waiting-depth alerts**: the [redis-saturation/](src/infrastructure/observability/redis-saturation/) module samples Redis `used_memory`/`maxmemory` ratio and BullMQ `waiting`+`delayed` depth on the dlq-depth worker's existing schedule. Memory saturation is the leading indicator for the `noeviction` write-outage failure mode; waiting depth surfaces a worker outage before the backlog fills Redis. Both warn via `logger` and escalate to Sentry past their thresholds (`REDIS_MEMORY_WARN_RATIO` / `REDIS_MEMORY_CRITICAL_RATIO`, `QUEUE_WAITING_DEPTH_WARN_THRESHOLD`).
- **DB pool alerting**: similar pattern for Postgres pool waiters — a long-running pool wait is a leading indicator of a transaction holding a connection across a remote round trip (see `billing` invariant about Stripe calls outside RLS contexts).
- **Provider outage pauses**: `bullmq_provider_outage_parked_jobs_total{queue,provider}` counts jobs parked because Resend, Stripe or S3 was down — each one also re-arms its queue's five-minute pause. A rate that keeps rising is an outage still in progress: the queue is waiting for the provider, not losing jobs. Pair it with the circuit state in `/readyz`.
- **Read-cache hit ratio**: `read_cache_requests_total{cache,result}` is recorded by every Redis read cache (see [read-caching](src/PATTERNS.md)). It exists because a cache is otherwise unfalsifiable — it either removes a pool checkout or quietly costs a Redis round trip per request, and nothing in the logs distinguishes the two. The label is the cache's **name**, never its key, so cardinality stays bounded. Alert on a sustained drop rather than an absolute value: the right ratio differs per cache, and a collapse after a deploy usually means an invalidation became too broad.

## Operational concerns

- **PII redaction**: the Sentry `beforeSend` hook strips emails, IP addresses, and tokens from breadcrumbs and event tags. The redaction list lives in [sentry.ts](src/infrastructure/observability/sentry/sentry.ts).
- **Sample rate**: `SENTRY_TRACES_SAMPLE_RATE` controls trace sampling; we run at 1.0 in dev and a tunable rate in prod.
- **Profile cadence**: continuous profiling runs in 60 s windows; Sentry merges them into the project's profile timeline.

## External dependencies

- **Sentry** — error / trace / profile / log destination.

## Failure modes

- **Sentry unavailable** → SDK queues events in memory up to a cap; events drop after the cap (logged at warn). Application path is not blocked.
- **Pino transport blocks on stdout** (very rare, container-level pipe full) → the worker pool can stall; mitigated by the cloud provider's log forwarding.
- **Idempotency-cardinality SCAN is bounded** so it cannot trigger Redis CPU pressure, but a cluster of large mismatches will produce alerts.
