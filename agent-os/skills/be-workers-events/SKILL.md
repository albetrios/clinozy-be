---
name: be-workers-events
description: Implements and maintains clinozy-be patterns for domain events, BullMQ queues, and worker processes (Redis-backed). Use when adding event emission in services, registering handlers, defining queues/jobs, implementing workers, or handling graceful shutdown and retries.
indexNote: domain events + BullMQ queues/workers (Redis, retries, graceful shutdown)
---

# Workers + events (EventBus + BullMQ)

**Rules first:** every rule for a queue, worker, cron or sweep — job identity, enqueue after
commit, provider pause, lost-enqueue sweeps, registration, capacity, tests — with the test that
enforces it, is in [queue-and-worker-rules.md](../../../docs/reference/runtime/queue-and-worker-rules.md)
(rule: `agent-os/rules/be-queue-worker-conventions.mdc`). This skill is the procedure.

## Core pattern

- **Services emit domain events** (in-process) after successful DB writes.
- **Event handlers enqueue BullMQ jobs** for side effects.
- **Workers process jobs** (pull-based) and interact with integrations/DB as needed.

Event handler failure must **not** fail the HTTP request (log and continue).

## Naming conventions

- **Event types**: `"<domain>.<verb>"` (e.g. `organization.created`)
- **Queue names**: `"<domain>"` (e.g. `organization`)
- **Job names**: `"<domain>.<action>"` (e.g. `organization.created`)
- **Payload fields**: prefer **snake_case** for identifiers in event payloads (e.g. `organization_id`, `created_by`)
- **Public handles only**: event and job payloads, `jobId`s, commit-dispatch tasks and dead-letter summaries carry public ids (`<entity>PublicId` / `<entity>_public_id`) or a per-row random token — never a bigserial. Queued jobs outlive a restore that restarts the sequence, and a reused id loads (or dedupes against) a different row. Use the public id as the BullMQ `jobId` when the contract is one job per row; a job whose row is gone completes as skipped unless that is our fault
- **Full names only**: `repository` not `repo`, `organization` not `org`, `database` not `db`

## Resilience settings

There is no project-wide default: every queue sets `attempts` and `backoff` in its enqueue
options, caps `removeOnComplete` / `removeOnFail`, and adds retry jitter
(`QUEUE_RETRY_JITTER_RATIO`, 20%). Current settings:

| Queue | Attempts | Backoff |
| ----- | -------- | ------- |
| `notification`, `user-data-export` | 3 | exponential from 5 s |
| `subscription-seat-sync` | 5 | exponential from 5 s |
| `stripe-webhook` | 5 | custom, doubling from 10 s (`stripe-webhook-backoff.util.ts`) |
| `mail` | 8 | custom, doubling from 5 s (`mail-backoff.util.ts`) |
| `webhook-delivery` | 8 | custom schedule, 1 min → 10 h (`WEBHOOK_DELIVERY_RETRY_DELAYS_MS`) |

Attempts are spent only on failures that are the job's own. A queue whose every job calls one
third-party provider (`mail` → Resend, `stripe-webhook` and `subscription-seat-sync` → Stripe,
`user-data-export` → S3) is created with `createProviderPausableWorker`
(`src/infrastructure/queue/worker-runtime/provider-outage-pause.util.ts`): while the provider is down
the whole queue pauses on every replica and probes every five minutes, and the failed job is parked
without spending an attempt. It declares `PROVIDER_OUTAGE_PAUSABLE_LIMITER` because BullMQ enforces a
queue-wide pause only for a worker with a limiter. A provider throttle (Resend 429
`rate_limit_exceeded`) pauses only for its `Retry-After`, and `mail` paces itself with a real
limiter (`RESEND_MAX_REQUESTS_PER_SECOND`) and sends `transactional` mail ahead of the `bulk` lane.
Scheduled sweeps and `webhook-delivery` do not pause. Detail: [workers-and-events.md → Provider outage pause](../../../docs/reference/runtime/workers-and-events.md#provider-outage-pause).

## Durability and per-aggregate ordering

- **A row-backed job gets a sweep for lost enqueues.** The enqueue runs after the commit and fails
  fast while Redis is unreachable or full, so the row can exist with no job. When a row holds the
  work (mail outbox, webhook delivery attempts, the Stripe event ledger), an enqueue error leaves
  the row pending — never marks it failed — and a scheduled sweep in the **same family** as the
  worker re-enqueues rows still pending after a cutoff (`mail-outbox-sweeper`,
  `webhook-delivery-reclaim`, `stripe-webhook-event-reclaim`, `reclaim-pending-user-data-exports`). Key the job on the row's public id or
  token so the sweep's add is a no-op while the job exists. Table: [workers-and-events.md → When
  Redis refuses the enqueue](../../../docs/reference/runtime/workers-and-events.md#when-redis-refuses-the-enqueue).
- **A job that pushes an aggregate's latest state runs one at a time per aggregate.** Deduplicate
  on the aggregate with `keepLastIfActive` (see `subscriptionSeatSyncDeduplication`): a waiting job
  absorbs further adds, a change that lands mid-run runs once after it, and two replicas never run
  the same aggregate at once — otherwise the run that read the older state can finish last. Never a
  stable `jobId` for this: a retained completed or failed job silently drops every later add.
- **Every worker service keeps `SCHEDULER_ENABLED=true`.** Each process registers only the crons of
  the queues it runs; a service with the scheduler off leaves its families' sweeps unregistered
  (`scheduler.disabled.crons_not_registered`).

## Files/locations

- Event bus: `src/core/events/event-bus.ts`
- Queue infrastructure (**connection**, **scheduler** for repeatable retention jobs, **dead-letter** for `<source-queue>-dlq` + final-failure Sentry, **bootstrap**): `src/infrastructure/queue/connection.ts`, `src/infrastructure/queue/scheduler.ts`, `src/infrastructure/queue/dlq/dead-letter.ts`, `src/infrastructure/queue/bootstrap.ts`
- Worker options (stalled job config): `src/infrastructure/queue/worker-runtime/worker-options.ts` — use `getDefaultWorkerOptions()`, `getWebhookWorkerOptions()`, or `getRetentionWorkerOptions()` so lock duration and stall handling are explicit; subscribe to `worker.on('stalled', ...)` for logging
- Redis client: `src/infrastructure/cache/redis.client.ts`
- Domain event aggregator: `src/domains/<domain>/events/index.ts` → calls sub-domain `register*EventHandlers()`
- Event types + handlers: `src/domains/<domain>/sub-domains/<sub-domain>/events/*` (or nested: `sub-domains/<parent>/<child>/events/*`)
- Queue definitions + enqueue helpers: `src/domains/<domain>/sub-domains/<sub-domain>/queues/*` (same nesting rule)
- Workers: `src/domains/<domain>/sub-domains/<sub-domain>/workers/*` (or nested path; or domain root `workers/` for flat domains (`audit`, `upload`) and domain-spanning workers, e.g. `user`)
- Worker entrypoint: `src/worker.ts`

**Important**: Queue infrastructure lives in `src/infrastructure/queue/` and only wires Redis, **central repeatable-job registration** (`scheduler.ts`), **dead-letter** (`dead-letter.ts`) + worker DLQ/Sentry hooks from `bootstrap.ts`, and worker startup. **Processor** logic and **event-driven** queue definitions + enqueue helpers must reside in their respective domain sub-domains, **not** in infrastructure or shared.

- **Repeatable / cron jobs (retention cleanup):** register every `upsertJobScheduler` entry in `src/infrastructure/queue/scheduler.ts` only. Domain worker files define the `Worker` processor only (same queue name as in `scheduler.ts`).

> **commit-dispatch subsystem** (`src/infrastructure/queue/commit-dispatch/`): A recovery worker, executor, and store for durable post-commit side effects. Not a domain worker — lives in infrastructure. When implementing patterns that need guaranteed post-commit delivery, consult this subsystem.

For a visual flow diagram (Service → EventBus → Handler → Queue → Redis → Worker), see `README.md` § Architecture Diagrams → Event-Bus and BullMQ Flow.

## Dead-letter queue and alerting

- A failure is **final** when the job exhausted its BullMQ retries (`job.attemptsMade >= (job.opts.attempts ?? 1)`) or threw `UnrecoverableError`. `attachDeadLetterAndAlerting` (wired from `bootstrap.ts` for each worker) then records it in `audit.dead_letter_jobs` and enqueues a **`dead-letter`** snapshot to **`<source-queue-name>-dlq`** (**snake_case**: `original_queue`, `original_job_id`, `original_data_summary`, `failed_reason`, `replay_depth`, …).
- **Transient** failures log `queue.job.retry` at **warn**; **final** failures log `queue.job.final_failure` and send **one** Sentry event per failure (fingerprint `worker_final_failure` + queue + job name). Do **not** call `captureException` from individual `worker.on('failed')` handlers — that duplicates noise across retries.
- **Choose the failure on purpose:** throw `UnrecoverableError` for a job that can never succeed (a missing row, an unreadable secret) — it is recorded and alerted. A failure that is somebody else's (a customer endpoint) declares `expectedFinalFailure = true` on its error: recorded, warn log, no page. A job with nothing left to do (its row is gone, already sent) **returns** a skip instead of throwing.
- Workers return `{ worker, queueName, close }` (see `WorkerHandle` in `bootstrap.ts`) so bootstrap can attach the hook; the repeatable-job **scheduler** handle has `close` only.
- Bull Board (`queue-dashboard.ts`) lists each `-dlq` queue next to its source queue when the dashboard is enabled.
- On worker shutdown, `closeDeadLetterQueues()` runs after worker handles close (see `src/worker.ts`).
- **Poison messages:** at each worker processing entry point, validate `job.data` with `parseJobDataOrDeadLetter({ schema, job, queueName })` (`src/infrastructure/queue/dlq/poison-job.util.ts`) instead of `parseBullMQJobData`. On a schema failure it records the dead-letter (Postgres + Redis mirror) and throws BullMQ `UnrecoverableError` marked `markDeadLetterRecorded`, so a malformed payload skips the remaining retries instead of burning the backoff budget. `attachDeadLetterAndAlerting` alerts on it without recording it a second time. Keep using `parseBullMQJobData` in the producer-side `enqueue*` helpers (enqueue is not a retry path).

## Distributed tracing across the queue

- **Inject on enqueue:** spread `captureTraceContextForPropagation()` into the job payload in every `enqueue*` helper, and merge `traceContextJobFieldsSchema` (`src/infrastructure/observability/tracing/trace-context-job-fields.schema.ts`) into the job's `*.job.schema.ts` so `traceparent` / `tracestate` validate.
- **Extract in the worker:** wrap the job body in `runWithPropagatedTraceContext({ traceparent, tracestate }, job.name, () => …)` (`trace-context.util.ts`) so the worker span is a child of the originating request. Both helpers no-op when no span is active or tracing is off.

## Canonical examples

**Tenancy — member invitation**

```text
member-invitation.service.ts  →  eventBus.emit(tenancy.member_invitation.created|resent)
tenancy/sub-domains/membership/member-invitation/events/*.ts  →  recordOutboxEmail() + onCommit(dispatchOutboxEmail)
tenancy/events/index.ts  →  registerTenancyEventHandlers()
```

**Auth — transactional email** (email verification-code, password reset)

```text
email-login.service.ts / auth-method.service.ts  →  eventBus.emit(auth.*.requested)
auth/sub-domains/auth-method/events/*.ts  →  recordOutboxEmail() + onCommit(dispatchOutboxEmail)
auth/events/index.ts  →  registerAuthEventHandlers()
```

**Notify — in-app notification** (invitation accepted)

```text
member-invitation.service  →  eventBus.emit(tenancy.member_invitation.accepted)
notify/sub-domains/notification/events/member-invitation-accepted.event-handlers.ts  →  notification row + enqueue
```

**Tenancy + billing → notify — organization resource events** (the webhook catalog)

```text
organization / membership / member-invitation / subscription services (+ Stripe webhook dispatch)
  →  eventBus.emit(<ORGANIZATION|MEMBERSHIP|SUBSCRIPTION>_EVENT.*, { organization_public_id, data })
     inside the write's organization context
notify/sub-domains/webhook/events/organization-resource.event-handlers.ts
  →  WebhookService.dispatchOrganizationWebhooks → PENDING attempts in the same transaction
```

Every unit of work releases its after-commit tasks only when it commits (`runInCommitUnit`), so
enqueues wait for the commit in workers too, and are dropped when the unit rolls back. The fan-out
runs in one savepoint (`withSavepoint`): a failure there never fails the producer's write.

**Notify — outbound webhook delivery**

```text
emitWebhookDeliveryRequested()  →  notify/sub-domains/webhook/webhook-delivery/events/webhook-delivery-emit.ts
notify/sub-domains/webhook/webhook-delivery/events/webhook-delivery.event-handlers.ts  →  enqueueWebhookDelivery()
```

`notify/events/notify.event-handlers.ts` registers these notify handlers plus the
invite-accepted notification and the organization resource fan-out above.

`src/core/events/register-event-handlers.ts` calls each domain’s `register*EventHandlers()` (from `buildApp()` before routes).

## Implementation checklist

1. **Emit**
   - In the service method (after DB create/update), call `eventBus.emit({ type, payload, timestamp })` with snake_case payload fields.

2. **Handle**
   - Register handler once at startup via `registerEventHandlers()` in `src/core/events/register-event-handlers.ts` (invoked from `buildApp()`).
   - Handler should:
     - validate payload shape
     - enqueue job
     - catch/log errors (do not throw up to HTTP path)

3. **Work**
   - Worker should:
     - switch on `job.name`
     - log structured metadata (job id, organization id, etc.)
     - be idempotent when possible
   - **Database access in workers/processors** (never `getRequestDatabase()` or `database-context-runtime` imports):
     - Type handles via `PostgresDatabaseHandle` / `WorkerDatabaseHandle` in `src/infrastructure/database/utils/database-handle.types.ts` and `src/infrastructure/queue/worker-runtime/worker-processor.util.ts`
     - **Runtime guard:** `src/worker.ts` sets `CLINOZY_BE_RUNTIME=worker`. Unpinned `getRequestDatabase()` throws `WorkerDatabaseContextError`. Context kind is tracked in `database-context-runtime.ts` (ALS).
     - Use `runOrganizationScopedWorkerJob`, `runGlobalRetentionWorkerJob`, or `runUserScopedWorkerJob` from `worker-processor.util.ts`, or `createTenantScopedBullMQWorker` for tenant-scoped queues, or call the context wrappers directly
     - Tenant-scoped jobs → `withAppDatabaseContext(PRINCIPAL_SCOPE.JOB({ organizationPublicId }), (databaseHandle) => …)` — pins ALS + `SET LOCAL app.current_organization_public_id`
     - Global tombstone/retention → `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP, (databaseHandle) => …)` — `app.global_retention_cleanup`
     - GDPR export → `withAppDatabaseContext(PRINCIPAL_SCOPE.JOB({ userPublicId }), (databaseHandle) => …)` — `app.current_user_public_id`
     - Session cleanup → `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.SESSION_RETENTION_CLEANUP, …)` — `app.session_retention_cleanup`
     - Mail outbox + Stripe webhook ledger (no tenant RLS) → `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER, …)` in processors/workers
     - Pass `databaseHandle` into `createWorker*Repository(databaseHandle)` factories; factories call `assertWorkerDatabaseContext` for the expected kind

4. **Bootstrap**
   - **Register every BullMQ worker in `src/infrastructure/queue/worker-runtime/worker-registration.registry.ts`** — the single source of truth for both startup (`bootstrap.ts`) and Postgres connection budgeting (`worker-connection-budget.ts`). Never register a worker directly in `bootstrap.ts`; never duplicate concurrency in the budget file.
   - Register repeatable retention schedules in `src/infrastructure/queue/scheduler.ts` (wired from `bootstrap.ts`). The scheduler is filtered to **active queues for the selected `WORKER_QUEUE_FAMILIES`** — pass the same `queueName` the registry uses.

5. **Shutdown**
   - On SIGTERM/SIGINT:
     - close BullMQ workers (drain)
     - close dead-letter `Queue` clients (`closeDeadLetterQueues`)
     - close Redis connection
     - exit with code 0

## Worker registration registry (Postgres pool budget)

Every BullMQ worker is registered exactly once in [`worker-registration.registry.ts`](../../../src/infrastructure/queue/worker-runtime/worker-registration.registry.ts). The registry powers three things in one place:

1. **Startup** — `bootstrap.ts` reads the registry filtered by `WORKER_QUEUE_FAMILIES`.
2. **Connection budget** — `worker-connection-budget.ts` sums Postgres demand from the same definitions and `assertPostgresConnectionBudget()` enforces it (fails fast in both monolithic and split mode; warns when the 25% burst headroom does not fit).
3. **Scheduler filtering** — `scheduler.ts` only registers crons for queue names active in this process.

### Registration shape

```typescript
{
  queueName: '<unique BullMQ queue>',
  family: 'mail' | 'notify' | 'webhook' | 'stripe' | 'retention' | 'observability',
  logLabel: 'human-readable worker name',
  usesPostgres: true | false,
  scheduled: true | false,
  criticality: 'throughput' | 'maintenance' | 'observability',
  holdsConnectionDuringExternalIo?: true | false,
  resolvePostgresConcurrency?: (workerContainers) => number,
  isEnabled?: (workerContainers) => boolean,
  create: (workerContainers) => WorkerHandle,
}
```

`retentionDefinition({ ... })` defaults `usesPostgres: true`, `resolvePostgresConcurrency: () => RETENTION_WORKER_CONCURRENCY`, `scheduled: true`, and `criticality: 'maintenance'`. Override `scheduled` only for orphan workers (registered but no cron yet).

### Field decisions

| Field                             | How to choose                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `family`                          | Pick the smallest family that fits. Throughput workers → `mail` / `notify` / `webhook` / `stripe`. Crons / sweepers / tombstone / partition / GDPR retention → `retention`. Redis-only monitoring → `observability`.                                                                                                                                                                                                     |
| `usesPostgres`                    | `true` if the processor checks out a postgres.js connection at any point during a job. `false` only when the processor talks exclusively to Redis / external HTTP (e.g. `dlq-depth`, `idempotency-cardinality`).                                                                                                                                                                                                         |
| `scheduled`                       | `true` when there is a matching `upsertJobScheduler` entry in `scheduler.ts`. `false` for event-driven workers (`mail`, `webhook-delivery`, `notification`, `stripe-webhook`). `subscription-seat-sync` and `user-data-export` are `true`: their workers also run a recovery sweep routed on `job.name` (the hourly `subscription-seat-reconcile`, the five-minute `reclaim-pending-user-data-exports`) — the pattern for a sweep that needs no worker or connection budget of its own. `scheduler-registry-audit.ts` cross-checks both directions and logs `worker.registry.scheduler_mismatch` on drift.                                                                                                    |
| `criticality`                     | `throughput` for workers that drive user-visible latency (event-driven mail/notify/webhook/stripe). `maintenance` for retention/cron/sweeper/reclaim. `observability` for metrics-only workers (`dlq-depth`, `idempotency-cardinality`). Surfaced in `worker.queue_families.selected` and pool alerts.                                                                                                                   |
| `holdsConnectionDuringExternalIo` | `true` when the Postgres checkout is held during an outbound HTTP / S3 / Resend / Stripe call. No worker sets it today. Omit / `false` when the DB context closes before any external IO — e.g. `audit-export`, which reads each batch in its own short retention context and uploads it to S3 outside, `webhook-delivery`, which claims and records the attempt in separate short transactions around (not across) the outbound POST, and the upload sweep / S3 retention purges (`purgeRowsAfterTheirObjects`), which open a short context per page with the S3 calls outside. Prefer that shape to a new `true`. Only meaningful when `usesPostgres: true`. |
| `resolvePostgresConcurrency`      | Throughput: `() => getWorkerConcurrencyMail()` / `_Notify()` / `_Webhook()` / `_Stripe()` from `@/shared/config/worker-concurrency.util.js`. Cron / retention / sweeper: use the `retentionDefinition()` helper (concurrency `RETENTION_WORKER_CONCURRENCY = 1`). Required when `usesPostgres: true`.                                                                                                                    |
| `isEnabled`                       | Only when the worker is conditional on env config (e.g. mail disabled in CI, Stripe disabled when keys absent). Omit when always enabled.                                                                                                                                                                                                                                                                                |
| `create`                          | Factory that returns a `WorkerHandle`. May accept `workerContainers` for cross-domain service deps (e.g. user-data-export needs `userDomain.userDataExportService`).                                                                                                                                                                                                                                                     |

### Checklist when adding a new worker

1. Implement the worker file under `src/domains/<domain>/<sub-domain>/workers/*.worker.ts` and export a `createXxxWorker()` factory that returns `WorkerHandle`.
2. Add a constants file (`<queue>.constants.ts`) exporting the queue name string.
3. **Add a single entry to `worker-registration.registry.ts`** — pick `family`, `usesPostgres`, `resolvePostgresConcurrency`, `scheduled`, `criticality`, and (when relevant) `holdsConnectionDuringExternalIo`. Use `retentionDefinition({ ... })` for single-concurrency cron workers (it defaults `scheduled: true` + `criticality: 'maintenance'`).
4. If it is a repeatable / cron job, add an `upsertJobScheduler` entry in `scheduler.ts` using the same `queueName` constant — and set `scheduled: true` in the registration. The startup audit will warn if these disagree.
5. **Add the queue constant to `WORKER_QUEUE_NAMES` in `src/infrastructure/queue/queue-catalog.ts`** (and to `WORKER_THROUGHPUT_QUEUE_NAMES` for `criticality: 'throughput'`). That one list gives the queue its depth gauge, a sampled and age-trimmed DLQ, its heartbeat read-out and a Bull Board entry; `queue-catalog.coverage.unit.test.ts` fails until it matches the registry. Bootstrap attaches the dead-letter, job-duration and heartbeat hooks to every registered worker — nothing to wire per worker.
6. If every job calls one third-party provider (Resend, Stripe, S3), build the worker with `createProviderPausableWorker` so the queue pauses through a provider outage instead of spending attempts.
7. Run targeted tests: `pnpm test:unit src/infrastructure/queue/worker-runtime/__tests__/unit/` and `pnpm test:unit src/infrastructure/database/__tests__/unit/assert-connection-budget.unit.test.ts` (asserts new demand is bounded).
8. Update the worker count and family breakdown in [`docs/deployment/runbooks/resource-limits.md`](../../../docs/deployment/runbooks/resource-limits.md#per-family-registry-breakdown-32-workers-29-use-postgres) when the totals change, including the **External-IO holding** column when `holdsConnectionDuringExternalIo: true`.

### Anti-patterns

- **Do not** register workers directly in `bootstrap.ts` — the registry is canonical.
- **Do not** add a parallel concurrency number anywhere else (env, config, budget file). The registry's `resolvePostgresConcurrency` is the only source.
- **Do not** put a worker in the wrong family — split deployments rely on `WORKER_QUEUE_FAMILIES` selecting correctly.
- **Do not** mark `usesPostgres: false` if any code path opens a transaction or calls a repository — the budget will under-count and the pool can starve.
- **Do not** add an `upsertJobScheduler` cron without flipping `scheduled: true` (or vice versa) — the startup audit will log `worker.registry.scheduler_mismatch`.
- **Do not** mark `holdsConnectionDuringExternalIo: false` for workers that wrap S3 / Resend / Stripe / outbound HTTP inside a DB context — the at-risk demand metric will under-count pool starvation risk during external slowness.

---

## Sync after changes (layered docs)

When a worker, processor, queue, event type, or handler is added or renamed:

1. **TSDoc on every public export** in the new `*.worker.ts`, `*.processor.ts`, queue file, or event-handlers file. Workers / processors are **service-like** and require both `summary` and `@remarks` (Algorithm / Failure modes / Side effects / Notes). Invoke **be-tsdoc-export-guard**.
2. **<folder>.overview.md** for the new domain / sub-domain folder if not present (Template A.2 with a `## Lifecycle` Mermaid showing the worker's job state machine). Invoke **be-overview-doc-maintainer**.
3. **System narrative** updates if the worker introduces a cross-cutting pattern (e.g. a new transactional-outbox surface) or participates in a new end-to-end flow. Invoke **be-system-narrative-maintainer**.
4. **Coverage check** — run `pnpm tsdoc:check` to confirm new worker / processor / queue / event exports carry summaries (and `@remarks` for service-like files).

The strict ratchet at pre-commit and CI ensures none of the four `MISSING_*` token counts grow when a worker is added.

## Don'ts

- Don't call integrations directly from services (emit events instead).
- Don't push jobs from HTTP controllers; keep it in services/events so behavior stays consistent across entrypoints.
- Don't place **processor** implementations in `src/infrastructure/queue/` — they belong in `src/domains/<domain>/<sub-domain>/workers/*`. Event-driven **queue + enqueue** helpers belong in `src/domains/<domain>/<sub-domain>/queues/*`. Exception: `scheduler.ts` registers repeatable **`upsertJobScheduler`** entries only (no processors).
- Don't call `getRequestDatabase()` from workers, processors, or `batch-delete.util.ts` — the guard tests block `database-context-runtime` and global `database` pool imports there; use explicit handles from context wrappers and `createWorker*Repository` factories.
- Don't register a worker outside the registry (`worker-registration.registry.ts`). Budget drift is the most common production-incident class this registry prevents.
