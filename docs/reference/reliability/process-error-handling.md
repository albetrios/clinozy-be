# Process error handling (API and worker)

Production-readiness audit finding **#14** — how `clinozy-be` treats fatal synchronous errors vs unhandled promise rejections.

## Policy summary

| Signal | Handler | Exit behavior |
| ------ | ------- | ------------- |
| **`uncaughtException`** | `server.ts` / `worker.ts` | Always **fatal**: Sentry capture → log → `process.exit(1)` after flush |
| **`unhandledRejection`** | `createUnhandledRejectionHandler()` | **Non-fatal by default**: meter + Sentry + error log; **fatal only on sustained burst** |

Rationale: a single un-awaited promise rejection (including from dependencies) must not drop all in-flight HTTP work. A **sustained burst** within a rolling window indicates a systemic failure and triggers supervisor restart.

## A database connection lost mid-transaction

Because `uncaughtException` is always fatal, a dependency that throws outside any promise takes the
process down. node-postgres emits `error` on a client whose connection drops — a failover, a network
drop, a server restart, a terminated backend — whether the client is idle in the pool or checked out
inside a transaction, and an `error` event with no listener is an uncaught exception. Every request's
unit of work runs in a transaction, so one blip could restart every replica at once and drop all
their in-flight work.

`createDatabasePool` ([`connection.ts`](../../../src/infrastructure/database/connection.ts)) listens on
the pool (idle clients) and on every client it connects (checked-out ones) and logs
`database.connection.error` instead. The statement in flight still rejects. A dropped client is never
reconnected — every later statement on it rejects too, so nothing a transaction callback sends after
the loss can run on another session — and the pool discards it on release, so it recovers by itself.
The transaction rejects, the request answers 5xx, nothing commits outside it, and the process lives.
[`transaction-connection-loss.integration.test.ts`](../../../src/tests/integration/database/transaction-connection-loss.integration.test.ts)
cuts a transaction's connection mid-query and between queries, cuts it with a query waiting, and
terminates its backend between statements; it fails on any uncaught exception and on any statement
that reaches another session — and it fails if either listener is removed.

A statement that fails while the connection stays up aborts the transaction instead (25P02), and
Postgres answers `COMMIT` of an aborted transaction by rolling back without an error. So that a
callback that caught the failure cannot report success with none of its writes kept, every
transaction the database contexts and `withTransaction` open refuses to commit after a failed
statement (`database.transaction.failed_statement_caught`); see
[database.overview.md](../../../src/infrastructure/database/database.overview.md).

## Unhandled-rejection burst thresholds

Implemented in [`unhandled-rejection.handler.ts`](../../../src/infrastructure/observability/unhandled-rejection.handler.ts):

| Constant | Value | Meaning |
| -------- | ----- | ------- |
| `UNHANDLED_REJECTION_BURST_WINDOW_MS` | 60_000 | Rolling window for burst detection |
| `UNHANDLED_REJECTION_BURST_THRESHOLD` | 20 | Rejections in-window that trigger fatal exit |

Both the API (`process="api"`) and worker (`process="worker"`) register the same handler with distinct Prometheus labels.

## Observability

- **Metric:** `process_unhandled_rejections_total{process}` — increments on every tolerated rejection.
- **Alerting:** page on a **sustained sub-threshold rate** (persistent failing path that never reaches the burst fatal exit). See [observability runbook](../../deployment/runbooks/observability.md).
- **Sentry:** every rejection is captured with `source=unhandledRejection` or `source=worker_unhandledRejection`.

## Verification

- Unit tests: [`unhandled-rejection.handler.unit.test.ts`](../../../src/infrastructure/observability/__tests__/unit/unhandled-rejection.handler.unit.test.ts)
- Global regression: `pnpm test:global`

## Related

- [health-checks.md](health-checks.md) — liveness vs readiness
- [external-service-resilience.md](external-service-resilience.md) — outbound circuit breakers
- [`src/PATTERNS.md`](../../../src/PATTERNS.md) — network I/O outside RLS database contexts (finding #5)
