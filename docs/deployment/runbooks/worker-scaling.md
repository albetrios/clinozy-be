# Worker scaling runbook

BullMQ workers run as a **separate process** (`node dist/worker.js` / `Dockerfile.worker`). Scale workers independently of the API.

---

## When to scale out

| Signal                         | Action                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Queue depth growing steadily   | Add worker replicas (same `REDIS_URL`, `DATABASE_URL`)                           |
| Job latency p95 above SLO      | Scale workers or tune `WORKER_CONCURRENCY` per queue                             |
| CPU pegged on worker container | Horizontal scale before raising per-process concurrency                          |
| DLQ depth alerts               | Fix root cause first; see [bull-board.md](../../reference/runtime/bull-board.md) |

---

## Railway / container notes

- Deploy **API** (`Dockerfile` `api` target) and **worker** (`Dockerfile.worker`) as separate services.
- Worker image has **no HTTP health endpoint** — rely on process exit/restart and queue metrics ([docker-images.md](../docker-images.md)).
- Use the same secrets as the API for `DATABASE_URL`, `REDIS_URL`, Stripe, mail, and Sentry.

---

## Safe scaling practices

1. **One logical queue name per job type** — do not shard the same queue across incompatible processors.
2. **Pass `organizationPublicId` in tenant-scoped job payloads** — workers set `app.current_organization_public_id` via `withAppDatabaseContext` (job-minted organization scope) / `runOrganizationScopedWorkerJob`, not HTTP middleware. Unpinned DB access in the worker process throws `WorkerDatabaseContextError` at runtime.
3. **System tables without tenant RLS** (`auth.mail_outbox`, `billing.stripe_webhook_events`) — use `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.SYSTEM_TABLE_WORKER, …)` in processors; see [workers-and-events.md](../../reference/runtime/workers-and-events.md).
4. **Redis key prefix** — parallel agents or environments must use distinct `REDIS` namespaces to avoid queue collisions.
5. **Graceful shutdown** — workers honor SIGTERM; allow drain time before force-kill during deploys.

---

## Splitting worker services by family

Workers are grouped into six families in the [worker registry](../../reference/runtime/workers-and-events.md#worker-registry-and-queue-families): `mail`, `notify`, `webhook`, `stripe`, `retention`, `observability`. `WORKER_QUEUE_FAMILIES` (default `all` = monolithic) selects which families a process runs.

| When to split                                              | Why                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Monolithic worker exceeds `DATABASE_POOL_MAX`              | Default demand is 48 Postgres slots; splitting reduces per-process demand and avoids contention.                       |
| Retention crons compete with throughput jobs at peak hours | Isolate `retention` to its own service so audit/tombstone runs do not steal connections from `mail`/`webhook`/`stripe`. |
| Need to size memory or replicas differently per workload   | Throughput families benefit from more replicas; retention typically needs only one replica.                             |

Recommended layout (see [resource-limits.md → Example Railway split](resource-limits.md#example-railway-split-same-image-different-env-per-service) for pool sizing):

| Service                | `WORKER_QUEUE_FAMILIES`      | `SCHEDULER_ENABLED` | Notes                                                                            |
| ---------------------- | ---------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `worker-throughput`    | `mail,notify,webhook,stripe` | `true`              | Horizontal-scale freely; replicas multiply pool demand.                          |
| `worker-retention`     | `retention`                  | `true`              | Run **one replica** — cron jobs are not idempotent across overlapping processes. |
| `worker-observability` | `observability`              | `true`              | Mostly Redis-only (`dlq-auto-retry` takes one Postgres connection); tiny footprint. |

Keep `SCHEDULER_ENABLED=true` (the default) on **every** worker service. The scheduler in each process registers only the crons of the queues whose workers run in that process, so turning it off on a service leaves that service's crons unregistered — on `worker-throughput` that means the mail outbox sweeper, commit-dispatch recovery, the Stripe reclaim / catch-up / retention and the webhook delivery reclaim never run, and lost work is never recovered. Registration is an idempotent upsert keyed by scheduler id, so replicas never double a cron. A process that runs cron queues with the scheduler off logs `scheduler.disabled.crons_not_registered` listing them.

Adding a new worker is a one-line entry in `worker-registration.registry.ts` with a `family` choice; `bootstrap.ts`, `scheduler.ts`, and `assertPostgresConnectionBudget()` pick it up automatically.

---

## Related

- [workers-and-events.md](../../reference/runtime/workers-and-events.md)
- [observability.md](observability.md)
- [resource-limits.md](resource-limits.md)
