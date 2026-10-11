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
process down. postgres.js 3.4.9 did so whenever a transaction's connection closed under it — a
failover, a network drop, a server restart: the transaction's next statement (or `begin()`'s own
`ROLLBACK`) was written from a `setImmediate` onto the closed socket and threw
`Cannot read properties of null (reading 'write')`. Every request's unit of work runs in a
transaction, so one blip could restart every replica at once and drop all their in-flight work.

The pinned postgres.js patch (`patchedDependencies` in `pnpm-workspace.yaml`, upstream's proposed
guard for porsager/postgres#1208) settles those writes with a catchable `CONNECTION_CLOSED`
instead: the transaction rejects, the request answers 5xx, and the process lives.
[`transaction-connection-loss.integration.test.ts`](../../../src/tests/integration/database/transaction-connection-loss.integration.test.ts)
cuts a transaction's connection mid-query and between queries and fails on any uncaught exception.

Still open upstream (porsager/postgres#1248): when another query is queued, the pool reconnects the
same connection and a transaction callback that keeps running after the failure can send its later
statements on the new session, outside any transaction. A callback that stops at its first failed
statement is not exposed; one that catches a statement's error inside the transaction and carries on
is — let the error leave the callback.

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
