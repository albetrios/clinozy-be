`src/infrastructure/database/`

# Database infrastructure

## Purpose

Postgres connection management, the transactional helpers, the migration runner, the shared `pgSchema` definitions, and the **context family** that owns the platform's RLS contract — `withAppDatabaseContext` (minted identity scope), `withAppDatabaseContext` (pre-auth session artifacts), and `withMaintenanceDatabaseContext` (kind-dispatched bypass scopes: `MAINTENANCE_SCOPE.GLOBAL_ADMIN`, `global_retention_cleanup`, `session_retention_cleanup`, `system_audit_insert`, `audit_outbox_drain`, `system_table_retention`, `system_table_worker`). Domains never construct Drizzle clients themselves; they receive a `databaseHandle` from one of these contexts.

## Design decisions

- **Postgres over alternatives**: chosen for transactional guarantees, RLS, mature operational tooling, and the Drizzle ORM's typed query DSL. Multi-region failover is handled by the managed provider (Neon / RDS).
- **Drizzle 0.45 + the `postgres` 3.x driver**: `postgres` driver chosen over `pg` for native prepared-statement support, simpler connection-pool semantics, and much better performance under load.
- **`snake_case` column names everywhere**: enforced by convention; matches Postgres native style and avoids the case-folding pitfalls of mixed identifiers.
- **RLS is the defense-in-depth layer**: every tenant-scoped table has an RLS policy. The application is expected to filter by `organization_id`; RLS is what prevents a bug from leaking rows across tenants.
- **Context family pattern**: instead of per-call `SET LOCAL`, contexts open a Drizzle transaction, set the GUC once, and pass a pinned `databaseHandle` to a callback. Reuse semantics: a worker context inside an HTTP request (or vice versa) for the same organization reuses the active handle (no nested top-level transaction, no lost `SET LOCAL`).
- **A context grants only what a policy names**: each wrapper sets exactly one GUC, and grants access only on tables whose policies test it. `app.current_organization_public_id` → tenant-scoped tables; `app.current_user_public_id` → user-owned rows **and** the tenancy discovery policies; `app.global_admin` → **`auth.*` and `audit.logs` only**; `app.global_retention_cleanup` → retention sweeps. Notably `MAINTENANCE_SCOPE.GLOBAL_ADMIN` grants **nothing on `tenancy.*`** — no tenancy policy carries that arm, so it reads zero rows there rather than erroring. Full matrix and rationale in [src/PATTERNS.md](src/PATTERNS.md#rls-context); pinned by `no-global-admin-in-tenancy.global.test.ts` and `tenancy-global-admin-invisibility.security.test.ts`.
- **Cross-context user lookups go through SECURITY DEFINER resolvers**: `auth.users` is FORCE RLS and self-scoped, so a direct join from organization context (or a post-commit path with no GUC) matches zero rows. Use `auth.resolve_user_id_by_public_id`, `auth.resolve_user_by_internal_id`, or `auth.resolve_user_public_ids_by_ids` instead.
- **Workers cannot use HTTP request DB context**: enforced at runtime by the worker-context guard in [contexts/database-context-runtime.ts](src/infrastructure/database/contexts/database-context-runtime.ts) (`WorkerDatabaseContextError`) and by the static scan in [worker-database-guard.unit.test.ts](src/tests/unit/infrastructure/database/worker-database-guard.unit.test.ts) over `*.worker.ts` / `*.processor.ts` imports.
- **Connection budget**: [assert-connection-budget.ts](src/infrastructure/database/safety/assert-connection-budget.ts) caps the per-process pool size against the managed Postgres tier limits.
- **RLS role safety**: [assert-database-rls-safety.ts](src/infrastructure/database/safety/assert-database-rls-safety.ts) refuses to boot in hosted deployments when `DATABASE_URL` resolves to a superuser or a `BYPASSRLS` role. PostgreSQL skips RLS (even `FORCE`d) for those roles, so a misconfigured connection string would silently collapse tenant isolation. Local docker-compose still tolerates the default `postgres` superuser (warn-only).
- **TLS verification safety**: [assert-database-tls-safety.ts](src/infrastructure/database/safety/assert-database-tls-safety.ts) refuses to boot in hosted deployments unless the Postgres client verifies the server certificate (`sslmode=verify-ca`/`verify-full` or `DATABASE_SSL_REJECT_UNAUTHORIZED=true`). Neon's common `sslmode=require` encrypts but does not validate the chain (MITM exposure). The SSL-mode parsing/strictness helpers live in [connection-url.util.ts](src/infrastructure/database/utils/connection-url.util.ts) (a side-effect-free module reused by the connection pool, the migration runner, and this assertion).
- **Migration runner requires a direct (non-pooler) endpoint**: [migration/migrate.ts](src/infrastructure/database/migration/migrate.ts) fails fast when `DATABASE_MIGRATION_URL` is a pooler (`-pooler` host or `?pgbouncer=true`), because the session-level `pg_advisory_lock` that serializes concurrent deploys is not pinned to one backend through a transaction-mode pooler.
- **Force-RLS table list** at [force-rls-tables.constants.ts](src/infrastructure/database/utils/force-rls-tables.constants.ts): the migration linter rejects new tables that should be RLS-eligible but aren't in the list.

## Operational concerns

- **Three timeouts, three failures — none substitutes for another** (all set as connection parameters): `statement_timeout` (`DATABASE_STATEMENT_TIMEOUT_MS`, HTTP override `DATABASE_HTTP_STATEMENT_TIMEOUT_MS`) kills a runaway query; `idle_in_transaction_session_timeout` (`DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS`) kills an abandoned transaction; `lock_timeout` (`DATABASE_LOCK_TIMEOUT_MS`, default 3000) bounds a statement **waiting behind someone else's lock**. A lock waiter is neither idle nor executing, so only `lock_timeout` bounds it — yet it holds its pooled connection for the whole wait, which is how lock contention turns into pool exhaustion. The statement layers accept `0` (disabled); the idle and lock timeouts enforce a `1000` floor so one misconfiguration cannot silently remove the ceiling. Worker transactions lift both HTTP-tuned caps with `SET LOCAL` (`DATABASE_WORKER_STATEMENT_TIMEOUT_MS`, `DATABASE_WORKER_LOCK_TIMEOUT_MS`) — background work has a 5-minute statement budget and retries safely, so a 3s lock give-up would only churn the DLQ. Set them in the **server parameter group** too — anything connecting outside the app's own path (migration runner, ops scripts) otherwise has no bound.
- **Getting a connection has its own deadline** (`DATABASE_POOL_ACQUIRE_TIMEOUT_MS`, default 10000 — the connect timeout, so a cold start is not cut short; `0` disables). postgres.js has no acquire timeout: with no connection open and the database unreachable, a transaction waits as long as the outage lasts, outlives the request that started it, and commits once the database is back — after the client was told it failed. Every pooled unit of work goes through `runPooledUnitOfWork` in `contexts/database-context.ts`, which answers `503` + `Retry-After` at the deadline and makes a connection that arrives later roll the transaction back unrun. An abandoned wait keeps counting in the in-flight gauge until the pool lets it go, so the overload guard keeps shedding meanwhile. Proven by `postgres-cold-pool-acquire-deadline.chaos.test.ts`.
- **Pool sizing**: `DATABASE_POOL_MAX` (default 30). `assertPostgresConnectionBudget` refuses to boot when the deployment's processes × pool would exceed the connections the database allows the application.
- **Checkout observability**: [organization-rls-checkout-counter.ts](src/infrastructure/database/pool/organization-rls-checkout-counter.ts) tracks in-flight organization-scoped RLS checkouts (every `withAppDatabaseContext` unit of work). It feeds the pool-exhaustion alerter and the `database_rls_active_checkouts` gauge + `database_rls_checkout_hold_seconds` histogram (see [observability runbook](docs/deployment/runbooks/observability.md)) so checkout starvation and over-long holds are caught before requests queue.
- **Append-heavy table retention**: `audit.logs` and `notify.notifications` are plain (non-partitioned) tables. Growth is bounded by row-level retention workers (`audit-retention`, `notification-retention`) that batch-`DELETE` rows older than their configured retention window, backed by the `created_at` indexes.
- **Migrations** live under [migrations/](migrations/) at repo root; the runner is `pnpm db:migrate`. The lint check is `pnpm db:migrate:lint`.

## Repeated principal identity settings

Nested principal scopes may omit a redundant user `set_config` only when they use the original transaction handle and its unchanged original user. Requesting a different identity or layering on a pinned savepoint permanently disables the shortcut for that transaction. This avoids trusting cached identity after savepoint release/rollback; every fresh transaction still arms its own RLS GUCs. The bookkeeping carries no permission grant and expires with the callback. Real application-role regressions live in `savepoint-guc-totality.security.test.ts`.

## Resolver checkouts

Context-free SECURITY DEFINER reads still reuse an active pinned handle. A resolver must not call the global pool while its service holds a pooled transaction: concurrent cache misses can reserve every connection and then exhaust the pool while waiting for second checkouts. Organization locale and MFA-policy reads use `getContextFreeDatabase()` so they also see the caller's uncommitted policy changes. Resolver tests assert the values under the application role.

## External dependencies

- **Postgres 17+** — production runs against managed Postgres; `pnpm db:migrate` refuses anything older. Local dev uses Docker Compose.

## Tuning parameters

- `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`.

## Failure modes

- **Postgres unavailable** → connection probe fails; readiness `/readyz` returns 503; load balancer yanks traffic.
- **RLS GUC missing or wrong for the table** (a worker that skipped a context wrapper, or code that picked a context whose GUC no policy on that table tests) → the access is treated as cross-tenant: reads return zero rows, writes fail their `WITH CHECK` with SQLSTATE 42501. There is no error on the read path — it simply looks like "no data". **The default test suite cannot catch this**: `docker-compose.yml` and every CI workflow connect as `POSTGRES_USER: clinozy`, a container superuser that bypasses RLS wholesale, whereas deployed environments connect as `clinozy_be_app` itself — a `NOBYPASSRLS` login that clinozy-infra creates before the first deploy (maintenance contexts as `clinozy_be_maintenance`, likewise RLS-subject) — see the [runtime-role runbook](docs/deployment/runbooks/resource-limits.md). Cover such paths with a test that runs as `clinozy_be_app` (see `src/tests/security/rls/`), and maintenance paths as `clinozy_be_maintenance` — the only role the bypass arms admit (the `useMaintenanceDatabaseRole` option on `withMaintenanceDatabaseContext`).
- **Long-running query** → statement timeout fires; the query is killed and the request returns 5xx.
- **Multi-region replica lag** → the managed provider routes reads; this module does not split read/write.

## Related runbooks

- Postgres failover procedure (managed-provider docs).
- Migration replay / dry-run: `pnpm db:migrate:dry-run` and `pnpm db:migrate:lint`.
