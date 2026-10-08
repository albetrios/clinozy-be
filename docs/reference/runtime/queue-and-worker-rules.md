# Queue and worker rules

Every rule for adding or changing a BullMQ queue, worker, cron or sweep in clinozy-be, on one page:
what to do, why, and what enforces it. The mechanisms behind the rules are explained in
[workers-and-events.md](workers-and-events.md); the step-by-step procedure is the
[be-workers-events](../../../agent-os/skills/be-workers-events/SKILL.md) skill. A rule marked
**(test)** fails a test or gate when broken; the others are review rules.

## 1. Decide what you are adding

| Question | Answer → rule |
| --- | --- |
| Does a user action create the job? | Event-driven queue: enqueue after the commit ([§4](#4-enqueue)), throughput worker ([§5](#5-worker)) |
| Does it run on a clock? | Cron: [§7](#7-crons-and-sweeps), `retentionDefinition`, concurrency 1 |
| Does every job call one third party (Resend, Stripe, S3)? | Provider-pausable worker ([§6](#6-failures-and-third-party-outages)) |
| Is the work held in a Postgres row? | That row is the outbox: an enqueue failure leaves it pending, and a sweep re-enqueues it ([§4](#4-enqueue)) |
| Does each job belong to one organization or user? | `organizationPublicId` / `userPublicId` in the job data ([§3](#3-job-data)) |
| Does it push an aggregate's latest state (a seat count)? | One job per aggregate at a time ([§4](#4-enqueue)) |

## 2. Where the files go

1. Queue, enqueue helper and job schema live in the owning domain:
   `src/domains/<domain>/sub-domains/<sub-domain>/queues/<name>.queue.ts` + `<name>.job.schema.ts`.
   Worker and processor: `.../workers/<name>.worker.ts` + `<name>.processor.ts`; a cron's queue name
   in `<name>.constants.ts`. Never in `src/shared/` or `src/infrastructure/` — only the shared
   machinery is there (connection, scheduler, bootstrap, dead letters, mail, commit dispatch, the
   observability samplers).
2. Register the worker **once** in
   [`worker-registration.registry.ts`](../../../src/infrastructure/queue/worker-runtime/worker-registration.registry.ts)
   — never start it in `bootstrap.ts`. The entry drives startup, the Postgres connection budget and
   scheduler filtering. **(test)** `worker-registration.registry.unit.test.ts`
3. Add the queue name to `WORKER_QUEUE_NAMES` in
   [`queue-catalog.ts`](../../../src/infrastructure/queue/queue-catalog.ts) (and
   `WORKER_THROUGHPUT_QUEUE_NAMES` for a throughput worker). That one list gives the queue its
   depth gauge, dead-letter sampling and trimming, heartbeat and Bull Board entry.
   **(test)** `queue-catalog.coverage.unit.test.ts`
4. A cron also gets an `upsertJobScheduler` entry in
   [`scheduler.ts`](../../../src/infrastructure/queue/scheduler.ts) and `scheduled: true` in the
   registry. **(test)** `registry-scheduler-consistency.unit.test.ts`, `scheduler.unit.test.ts`

## 3. Job data

1. **Public handles only** — public ids (`<entity>PublicId`) or a row's random token, never a
   bigserial: a queued job outlives a restore that restarts the sequence, and a reused id loads a
   different row.
2. **Ids, not documents.** The worker loads the row; the payload stays small and never goes stale.
3. **Tenant-scoped jobs carry `organizationPublicId`**, user-scoped jobs `userPublicId` — the worker
   opens its database context from them. A cross-tenant sweep is the exception and is listed in the
   policy's exemptions. **(test)** `tenant-scoped-job-data.policy.unit.test.ts`
4. **Validate on both sides**: a Zod schema in `<name>.job.schema.ts`; `parseBullMQJobData` at
   enqueue; `parseJobDataOrDeadLetter` in the worker, so a malformed payload is dead-lettered at once
   instead of retried.
5. **Carry the trace**: spread `captureTraceContextForPropagation()` into the payload, merge
   `traceContextJobFieldsSchema` into the job schema, and wrap the processor in
   `runWithPropagatedTraceContext`.
6. Job data keys are camelCase TypeScript; in-process **event** payloads are snake_case. Full names,
   no digits, as everywhere.

## 4. Enqueue

1. **Producer connection**: `getBullMQProducerConnectionOptions()` (no offline queue — a Redis
   outage fails the enqueue fast instead of hanging the request) and `prefix: getBullMQKeyPrefix()`
   on every `Queue`, `Worker` and `QueueEvents`. Without the prefix, environments sharing one Redis
   consume each other's jobs. **(test)** `bullmq-key-prefix.global.test.ts`
2. **Enqueue after the commit, never inside the transaction**: `eventBus.onCommit`,
   `runEnqueueAfterCommit`, or a durable `scheduleCommitDispatch` task. A job enqueued inside the
   transaction can run before the row exists, or for a row that rolls back.
3. **Every event-driven queue sets its own options**: `attempts`, `backoff` with
   `QUEUE_RETRY_JITTER_RATIO` (a `custom` backoff needs the worker's `settings.backoffStrategy`), and
   capped `removeOnComplete` / `removeOnFail` (`DEFAULT_JOB_RETENTION_COUNT`, `SEVEN_DAYS_SECONDS`).
   There is no global default; cron queues get `SCHEDULED_QUEUE_DEFAULT_JOB_OPTIONS` from the
   scheduler.
4. **Pick the job's identity on purpose**:

   | Contract | Use |
   | --- | --- |
   | One job per row (an email, a delivery attempt) | `jobId` = the row's public id or token |
   | One live job per key, re-addable later (a Stripe event) | `deduplication: { id }` |
   | Latest state of an aggregate (a seat count) | `deduplication: { id, keepLastIfActive: true }` + a unique `jobId` |

   Never a stable `jobId` for work that repeats for the same key: a retained completed or failed job
   silently drops every later add. Two jobs pushing the same aggregate's state must never run at
   once — the one that read the older state can finish last (`subscriptionSeatSyncDeduplication`).
5. **An enqueue never fails the request.** Event handlers catch, log and continue; the work is
   recovered by its sweep (§7) or, if it has no row, documented as lost.
6. **Row-backed work has a sweep for lost enqueues.** If a Postgres row holds the work, an enqueue
   error leaves the row pending — never marks it failed — and a sweep re-enqueues rows still pending
   after a cutoff (`mail-outbox-sweeper`, `webhook-delivery-reclaim`,
   `stripe-webhook-event-reclaim`). Table: [When Redis refuses the
   enqueue](workers-and-events.md#when-redis-refuses-the-enqueue).
7. A queue may set a **rate limiter** only for a real provider limit (mail:
   `RESEND_MAX_REQUESTS_PER_SECOND`, counted across every replica). Put urgent work ahead with
   `priority` lanes (sign-in mail before bulk), not with a second queue.

## 5. Worker

1. **Options from the shared helpers**: `getDefaultWorkerOptions()` (lock 30 s, one stall),
   `getWebhookWorkerOptions()` (lock 60 s, two stalls) or `getRetentionWorkerOptions()` (lock
   120 s); connection `getBullMQConnectionOptions()`; `prefix: getBullMQKeyPrefix()`.
2. **Concurrency**: a throughput worker reads its family's setting (`getWorkerConcurrencyMail /
   Notify / Webhook / Stripe`, default `WORKER_CONCURRENCY` = 4); a cron or sweep runs at
   `RETENTION_WORKER_CONCURRENCY` (1).
3. **Return a `WorkerHandle`** (`buildWorkerHandle`) and log the `stalled` event. Bootstrap attaches
   the dead-letter + Sentry hook, the job-duration histogram and the queue heartbeat to every
   registered worker — do not add your own `failed` handler that reports to Sentry.
4. **Idempotent processors**: claim the row atomically (`pending → sending`) and finish an
   already-done row as a skip, so a retried, stalled or duplicated job does nothing twice.
5. **Database access through a context runner**: `runOrganizationScopedWorkerJob`,
   `runUserScopedWorkerJob`, `runGlobalRetentionWorkerJob`, `withAppDatabaseContext(PRINCIPAL_SCOPE.JOB(...))`
   or `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.<kind>)`, with the handle passed to
   `createWorker*Repository(databaseHandle)`. Never `getRequestDatabase()` — it throws in a worker.
   A repository function for one context asserts it (`assertWorkerDatabaseContext([...])`).
   **(test)** `no-direct-db-in-services.global.test.ts`, `maintenance-context-confinement.policy.unit.test.ts`
6. **No external call inside a database context**: read in one short context, close it, call
   Stripe / S3 / Resend / HTTP, then write in another — a checkout held across a network call starves
   the pool under load. **(test)** `rls-context-network-isolation.global.test.ts`

## 6. Failures and third-party outages

1. **Choose the failure on purpose**:

   | Situation | Do | Result |
   | --- | --- | --- |
   | Nothing left to do (row gone, already sent) | return a skip | completed, no alert |
   | Can never succeed and it is our fault (bad payload, unreadable secret) | throw `UnrecoverableError` | dead letter at once + one Sentry alert |
   | Somebody else's failure (a customer endpoint) | set `expectedFinalFailure = true` on the error | dead letter, warn log, no page |
   | Transient (a timeout, a 500) | throw | retried with backoff; dead letter after the last attempt |

2. **A queue whose every job calls one provider pauses while it is down**:
   `createProviderPausableWorker({ provider })` — on an open circuit the whole queue pauses on every
   replica for `PROVIDER_OUTAGE_PAUSE_MS` (5 min), the failed job goes to the back of the line
   without spending an attempt, and the first jobs after the pause probe the provider (the circuit is
   half-open). A throttle
   (HTTP 429) throws `ProviderOutageError` with `retryAfterMs`, which pauses for that time only.
   A queue calling customer endpoints does **not** pause (one endpoint's outage must not stop the
   others); it relies on its per-endpoint circuit and retry schedule.
3. **A refusal of one request is not an outage**: a provider error that concerns only this request
   (an invalid recipient — `countsAsCircuitFailure: false` — or a missing S3 key) does not count
   against the circuit, so it neither opens it nor pauses the queue; the job fails on its own.
4. **Dead letters** go to Postgres (`audit.dead_letter_jobs`, the record) and the Redis mirror
   `<queue>-dlq` (max 1,000, trimmed after 30 days). `dlq-auto-retry` replays eligible ones every
   15 minutes, up to `DLQ_AUTO_RETRY_MAX_COUNT` (3) times, only while the provider's circuit is closed.

## 7. Crons and sweeps

1. **Register with `retentionDefinition({...})`** (Postgres, concurrency 1, `scheduled: true`,
   `maintenance`) and a `scheduler.ts` entry with a stable `schedulerId`; an env override for the
   cron is optional.
2. **A sweep lives in the same family as the worker it backs up**, so it runs wherever that worker
   runs (`mail-outbox-sweeper` → `mail`, `stripe-webhook-event-reclaim` → `stripe`,
   `webhook-delivery-reclaim` → `webhook`).
3. **Bounded and idempotent**: a fixed batch per run, oldest first, safe to run twice; a delete runs
   in batches with a per-run cap (`deleteInBatchesByCondition`, `BATCH_DELETE_MAX_BATCHES_PER_RUN`)
   and a savepoint per batch, so one blocked row never aborts the run.
4. **A cross-tenant sweep reads under `runGlobalRetentionWorkerJob`** and adds its jobs after the
   context closes.
5. **Keep `SCHEDULER_ENABLED=true` on every worker service.** Each process registers only the crons
   of the queues it runs; a service with the scheduler off leaves its families' sweeps unregistered
   and logs `scheduler.disabled.crons_not_registered`. Registration is an idempotent upsert, so
   replicas never double a cron.

## 8. Configuration and capacity

| Setting | Default | Rule |
| --- | --- | --- |
| `WORKER_CONCURRENCY` (+ `_MAIL`, `_NOTIFY`, `_WEBHOOK`, `_STRIPE`) | 4 | Per worker per process; replicas multiply it |
| `WORKER_QUEUE_FAMILIES` | `all` | Split services by family; every family's sweeps run with it |
| `SCHEDULER_ENABLED` | `true` | `true` on every worker service (§7) |
| `RESEND_MAX_REQUESTS_PER_SECOND` | 10 | Your Resend plan's limit; shared by every replica |
| `DATABASE_POOL_MAX` / `DATABASE_MAINTENANCE_POOL_MAX` | 30 / 10 | replicas × (pool + maintenance) must fit `max_connections`; the worker's peak demand must fit its pool, checked at boot **(test)** `worker-pool-budget.policy.unit.test.ts` |
| Redis `maxmemory-policy` | — | `noeviction` (or no `maxmemory`); the API refuses to start on an evicting `REDIS_URL`, and the worker refuses to start on an evicting BullMQ Redis |
| `DLQ_AUTO_RETRY_*` | on, 3 times, 30 min cooldown, 20 per run | Leave on |

A new worker changes facts that live in several places — keep them in step:
[resource-limits.md](../../deployment/runbooks/resource-limits.md) (per-family table, totals, split
example), [worker-scaling.md](../../deployment/runbooks/worker-scaling.md),
[redis-topology.md](../../deployment/runbooks/redis-topology.md) (connections per process),
[bull-board.md](bull-board.md), the worker counts in [workers-and-events.md](workers-and-events.md),
and the pinned counts in `worker-registration.registry.unit.test.ts` and `scheduler.unit.test.ts`.

## 9. Tests

1. **Unit**: the processor (repository and provider mocked), the enqueue options (`jobId`,
   `deduplication`, attempts), the event handler (an enqueue failure never escapes).
2. **Real Redis for any queue behaviour you rely on** — deduplication, pause, ordering, one job per
   key — in `src/tests/integration/queue/` or the domain's `__tests__/integration/`, and prove the
   test with a fault (remove the option, watch it fail).
3. **A new repository query**: a database test; a cross-tenant one also as the RLS-subject role
   (`pnpm test:rls-role`), since the superuser pool hides policy mistakes.
4. **Volume**: `src/tests/performance/queue-throughput.performance.test.ts` drives the shared runtime
   (10,000 jobs across two replicas, a backlog through an outage) — extend it when you change the
   runtime itself.

## 10. Don'ts

- Don't enqueue inside a transaction, or let an enqueue error fail an HTTP request.
- Don't put a bigserial, an email address or a document in a job payload.
- Don't use a stable `jobId` for repeatable work, or let two jobs push one aggregate's state at once.
- Don't mark an outbox row failed because Redis refused the enqueue.
- Don't hold a database context across a third-party call.
- Don't capture to Sentry from a worker's `failed` handler — bootstrap already reports final failures once.
- Don't start a worker in `bootstrap.ts`, or a queue missing from `WORKER_QUEUE_NAMES`.
- Don't create a `Queue` / `Worker` / `QueueEvents` without `prefix: getBullMQKeyPrefix()`.
- Don't add a rate limiter as a substitute for the provider pause, or pause a queue whose jobs call
  different endpoints.
- Don't turn `SCHEDULER_ENABLED` off on a worker service that runs cron queues.

## Related

- [workers-and-events.md](workers-and-events.md) — event bus vs workers, provider outage pause, registry, dead letters
- [external-service-resilience.md](../reliability/external-service-resilience.md) — circuits, retries, provider failure modes
- [resource-limits.md](../../deployment/runbooks/resource-limits.md) · [worker-scaling.md](../../deployment/runbooks/worker-scaling.md) · [redis-topology.md](../../deployment/runbooks/redis-topology.md)
- [dlq-runbook.md](../../process/dlq-runbook.md) — operating dead letters
