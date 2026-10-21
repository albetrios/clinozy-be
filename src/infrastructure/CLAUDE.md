# Infrastructure — clinozy-be

Claude Code loads this file when it works in `src/infrastructure/`. It holds sections moved out of the root [`CLAUDE.md`](../../CLAUDE.md), which keeps a pointer to each; the root rules apply here too.

## Infrastructure

```text
src/infrastructure/
  database/
    connection.ts             # Exports: database, pool (node-postgres), closeDatabase
    transaction.ts            # withTransaction() helper
    resource-quota-lock.util.ts # Advisory-lock guard for resource caps (per-scope count+insert serialization)
    pg-schemas.ts             # Shared pgSchema definitions (auth, tenancy, billing, notify, audit, upload, app)
    migration/migrate.ts      # Migration runner (+ migration-version.ts, migration-execution-mode.ts)
    contexts/                 # DB context wrappers (request / organization / tenant / user / retention / worker / system-audit-insert / global-admin / audit-outbox-drain) that set the RLS GUC
    pool/                     # Pool instrumentation (organization-rls-checkout-counter.ts)
    safety/                   # Boot guards: assert-database-rls-safety.ts, assert-database-tls-safety.ts, assert-connection-budget.ts
    utils/                    # batch-delete, capped-count, connection-url, force-rls-tables.constants, database-handle.types
  cache/
    redis.client.ts           # Redis connection (managed service)
    bullmq-redis.client.ts    # Separate BullMQ Redis client (logical DB) + redis-url / redis-prefix utils
                              # + redis.constants.ts, assert-redis-tls-safety.ts + assert-redis-eviction-policy.ts (boot guards), redis-topology-warn.util.ts,
                              #   redis-lock.util.ts (withRedisLock compare-and-del lock), redis-url.parse.util.ts,
                              #   redis-scan.util.ts (SCAN under the client's key prefix — ioredis leaves it off patterns)
                              #   redis-close.util.ts (closeRedisClient: QUIT a ready client, disconnect one that is not, so no client holds the process open)
  queue/
    connection.ts             # Re-exports Redis for BullMQ + getBullMQConnectionOptions()
    health.ts                  # BullMQ readiness helper (notification queue client ping)
    bootstrap.ts              # Registers repeatable jobs + starts domain workers; attaches DLQ hooks
    scheduler.ts              # Central BullMQ repeatable-job registry (cron index for retention workers)
    queue.constants.ts        # Shared queue names / constants
    queue-dashboard.ts        # Bull-Board dashboard wiring (/admin/queues)
    worker-runtime/           # Worker tuning + lifecycle: worker-options.ts, worker-processor.util.ts, worker-close.util.ts, worker-registration.registry.ts, worker-health.server.ts, scheduler-registry-audit.ts
    dlq/                      # Dead-letter subsystem: dead-letter.ts (per-source `<queue>-dlq` + final-retry Sentry), dead-letter.repository.ts/.schema.ts, dlq-auto-retry.*, dlq-replay.util.ts, poison-job.util.ts
    commit-dispatch/          # Post-commit dispatch recovery: commit-dispatch.executor.ts/.store.ts, commit-dispatch-recovery.worker.ts/.processor.ts
  mail/
    mail.service.ts           # Resend email service
    resend-api.error.ts       # Structured Resend API error (counts as a circuit-breaker failure)
    mail-outbox.schema.ts     # Transactional outbox table (shared infrastructure pattern)
    mail-outbox.repository.ts # Outbox persistence (not domain-owned)
    templates/                # HTML email templates (base, verification-code, invitation)
    queues/
      mail.queue.ts           # BullMQ queue + recordOutboxEmail / dispatchOutboxEmail
    workers/
      mail.worker.ts          # BullMQ processor for email delivery (+ mail-outbox-sweeper.worker.ts)
  payment/
    stripe.client.ts          # Stripe SDK client + helpers (customer, subscription, webhook)
  storage/
    object-storage.port.ts    # ObjectStoragePort — the one storage contract (services inject it; workers use the default adapter)
    s3-adapter.ts             # Its S3 implementation, getDefaultS3ObjectStorageAdapter() (+ s3-error.util.ts: not-found +
                              #   circuit classifier, stored-object-purge.util.ts)
  outbound/                   # Hardened outbound HTTP for third-party calls: outbound-fetch.ts (timeouts, redaction),
                              # outbound-call.ts, outbound-defaults.ts, outbound-error.ts, outbound-redaction.ts, index.ts
  resilience/                 # Circuit breaker + retry-with-backoff for outbound/third-party calls (circuit-breaker.ts, retry-with-backoff.util.ts, lua/)
  api-reference/              # Scalar API-reference wiring (scalar-api-reference.ts)
  observability/
    sentry/sentry.ts          # Sentry: errors, tracing, continuous profiling (V8 CpuProfiler), structured logs (+ sentry-sampling.util.ts)
    tracing/                  # W3C trace context across queued jobs (@opentelemetry/api, under Sentry): trace-context.util.ts, trace-context-job-fields.schema.ts
    metrics/                  # Prometheus / metrics registry (HTTP, DB-pool, BullMQ, business, event-loop)
    idempotency-cardinality/  # Bounded SCAN of idempotency keys → threshold log / Sentry (constants, service, worker; scheduled in queue/scheduler.ts)
    dlq-depth/                # DLQ depth + DB-pool alert sampling (service, worker, constants)
    redis-saturation/         # Redis used_memory/maxmemory ratio + BullMQ waiting-depth sampling (sampled by dlq-depth worker)
    posthog/                  # PostHog product-analytics client (posthog.ts)
    unhandled-rejection.handler.ts  # Burst-tolerant unhandledRejection policy
  mcp/
    mcp-server.ts             # MCP (ENABLE_MCP_SERVER, dynamic import; @modelcontextprotocol/sdk optionalDependency): POST /api/v1/mcp
    mcp-capabilities.ts       # Canonical MCP tools/resources (shared by MCP server + OpenAPI /reference UI)
    mcp-client-guide.ts       # Client integration guide served as the clinozy-be://client-guide MCP resource
```
