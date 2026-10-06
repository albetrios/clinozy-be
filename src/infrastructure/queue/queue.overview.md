`src/infrastructure/queue/`

# Queue infrastructure

## Purpose

BullMQ + Redis runtime for the platform. Owns connection management, the worker bootstrap, the centralized scheduler for repeatable retention jobs, the per-queue dead-letter sibling, and the worker-runtime helpers (RLS context, heartbeat, health server, shutdown timing). Domain-owned queues and processors live in their respective domain folders — this module never holds business logic, only the runtime substrate.

## Design decisions

- **BullMQ over alternatives**: native delayed/repeatable jobs and Redis-backed durability fit the platform's at-least-once / idempotent-handler model. Postgres-backed queues were considered but rejected — the queue would compete with hot business workloads for the same connection pool.
- **One Redis connection per worker process** (not per queue) to bound the connection count visible to managed Redis providers.
- **Producer `enableOfflineQueue: false`**: API-side enqueue helpers use `getBullMQProducerConnectionOptions()` ([connection.ts](src/infrastructure/queue/connection.ts)) so a Redis partition fails the add immediately instead of buffering jobs that would never drain (workers keep the shared options from `getBullMQConnectionOptions()`).
- **Per-environment key prefix**: every `Queue` / `Worker` / `QueueEvents` passes `prefix: getBullMQKeyPrefix()` ([connection.ts](src/infrastructure/queue/connection.ts)) — `<REDIS_KEY_PREFIX>bull` — next to its `connection`. BullMQ reads the prefix only from that option (default `bull`), so without it environments sharing one Redis (two deploy targets, or the test harness and a running `pnpm dev:worker`) share every queue. Enforced by `src/tests/global/bullmq-key-prefix.global.test.ts`.
- **Centralized scheduler**: every repeatable retention job is registered through [scheduler.ts](src/infrastructure/queue/scheduler.ts) so the cron index is trivially auditable. Domains export their queue + processor; this module owns the registration moment.
- **Per-queue DLQ**: a final failure — retries exhausted, or `UnrecoverableError` — is recorded in `audit.dead_letter_jobs` (the durable ledger, with its `replay_depth`) and mirrored to the sibling `<name>-dlq` queue (a public-id summary, never the full payload). It fires one Sentry event (hook attached from [bootstrap.ts](src/infrastructure/queue/bootstrap.ts)) unless the error declares `expectedFinalFailure`.
- **Bounded DLQ mirrors**: nothing consumes a `<name>-dlq` mirror, so BullMQ's `removeOnComplete` / `removeOnFail` never fire for it. A mirror holds at most `DEAD_LETTER_MIRROR_MAX_JOBS` (1,000) snapshots — past that a final failure is recorded in the ledger only — and `trimDeadLetterQueueMirrors` drops snapshots older than 30 days on every DLQ-depth tick, so a failure storm cannot fill the Redis every queue runs on.
- **Provider outage pause**: a queue whose every job calls one third-party provider is built with `createProviderPausableWorker` ([worker-runtime/provider-outage-pause.util.ts](src/infrastructure/queue/worker-runtime/provider-outage-pause.util.ts)) — while the provider is down the whole queue pauses on every replica, probes every five minutes, and parks the failed job without spending an attempt. The worker declares a limiter because BullMQ enforces a queue-wide pause only for a worker that has one.
- **Automated replay**: the `dlq-auto-retry` sweeper replays each ledger row of a replayable queue once, after the cooldown, through the source queue's own producer, one level deeper in its lineage; a lineage stops at `DLQ_AUTO_RETRY_MAX_COUNT`. No counter lives in Redis.
- **Shared job-options policy**: cross-queue defaults that are not queue-specific (e.g. completed/failed job retention count) live in [queue.constants.ts](src/infrastructure/queue/queue.constants.ts) so every event-driven domain producer queue stays consistent; queue-specific options (attempts, backoff, failure caps) remain in each domain's queue file.
- **Workers must use `runOrganizationScopedWorkerJob` / `runGlobalRetentionWorkerJob` / `runUserScopedWorkerJob`** from [worker-runtime/worker-processor.util.ts](src/infrastructure/queue/worker-runtime/worker-processor.util.ts). Workers never call `getRequestDatabase()`: it throws in worker runtime (the guard in [contexts/database-context-runtime.ts](src/infrastructure/database/contexts/database-context-runtime.ts)), and `no-direct-db-in-services.global.test.ts` scans for it.
- **Heartbeat keys in Redis**: each worker publishes a heartbeat with `WORKER_QUEUE_HEARTBEAT_TTL_SECONDS = 86 400`; the admin worker-readiness script consumes them.

## Operational concerns

- **Worker stall detection**: `BULLMQ_STALLED_INTERVAL_MS = 30 000` and `BULLMQ_DEFAULT_LOCK_DURATION_MS = 30 000`. Webhook delivery uses a longer 60 000 ms lock; retention sweepers use 120 000 ms.
- **Graceful shutdown**: the worker process drains in-flight jobs and closes connections within `FIFTEEN_SECONDS_MS`. The shutdown-timing util records the exact phase durations for post-incident review.
- **Connection-budget enforcement**: [worker-runtime/worker-connection-budget.ts](src/infrastructure/queue/worker-runtime/worker-connection-budget.ts) caps the per-process Redis connection count.
- **Queue dashboard**: optional Bull Board UI mounted by [queue-dashboard.ts](src/infrastructure/queue/queue-dashboard.ts) when `ENABLE_QUEUE_DASHBOARD=true`. Authenticated; admin-only.

## External dependencies

- **Redis** (managed in production via `REDIS_URL`). [src/infrastructure/cache/](src/infrastructure/cache/) owns the underlying client; this module re-exports through [connection.ts](src/infrastructure/queue/connection.ts).

## Tuning parameters

- `BULLMQ_DEFAULT_LOCK_DURATION_MS = 30 000`
- `BULLMQ_STALLED_INTERVAL_MS = 30 000`
- `BULLMQ_WEBHOOK_LOCK_DURATION_MS = 60 000`
- `BULLMQ_RETENTION_LOCK_DURATION_MS = 120 000`
- `WORKER_QUEUE_HEARTBEAT_TTL_SECONDS = 86 400`
- `DEFAULT_JOB_RETENTION_COUNT = 1 000` — completed/failed jobs kept per event-driven domain producer queue.
- `WORKER_CONCURRENCY` (env) — per-worker job parallelism.

## Failure modes

- **Redis unavailable** → workers fail fast and exit; Railway / Kubernetes restarts the pod once Redis recovers.
- **Worker crashes mid-job** → BullMQ stalls the job and another worker picks it up after the lock duration.
- **Job exceeds retries, or can never succeed** → final failure → ledger + DLQ + Sentry (warn and no Sentry for an expected one). Replay tooling lives in [dlq/dlq-replay.util.ts](src/infrastructure/queue/dlq/).
- **Third-party provider down** → its queues (`mail`; `stripe-webhook`, `subscription-seat-sync`; `user-data-export`) pause and probe every five minutes; jobs wait, they are not dead-lettered (`queue.provider_outage.paused`, `bullmq_provider_outage_parked_jobs_total`).

## Related runbooks

- DLQ replay procedure (when present in [docs/deployment/runbooks/](docs/deployment/runbooks/))
- Worker readiness investigation (`pnpm tool:worker-readiness`)
