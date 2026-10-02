# Maintenance database role (`clinozy_be_maintenance`)

Maintenance (RLS-bypass) database contexts — `withMaintenanceDatabaseContext` with a
`MAINTENANCE_SCOPE.<kind>` in
[`src/infrastructure/database/contexts/database-context.ts`](../../../src/infrastructure/database/contexts/database-context.ts)
— can run on a **dedicated connection pool** with its own Postgres role, so bypass
authority becomes a connection-level property instead of a GUC-only one.

## Current state (groundwork shipped, gating not yet enforced)

- Migration `20260827010000_clinozy_be_maintenance_role.sql` creates `clinozy_be_maintenance`
  **NOLOGIN** with data-plane grants mirroring `clinozy_be_app`.
- Migration `20260827020000_maintenance_role_policy_access.sql` extends the six
  role-scoped `*_app_access` system-table policies to both application roles (without it a
  maintenance-pool connection hits `deny_all` on the mail outbox / Stripe ledger / DLQ
  ledger) and grants `clinozy_be_app` membership so `SET LOCAL ROLE clinozy_be_app` tooling
  keeps working on maintenance connections.
- **Local development is provisioned**: the compose Postgres role has LOGIN and the
  gitignored local env file carries `DATABASE_MAINTENANCE_URL` — local runs and the DB
  test suites exercise maintenance contexts as `clinozy_be_maintenance` (production-like RLS
  instead of the superuser-exempt pool).
- **Hosted environments are provisioned by clinozy-infra**: its Neon provisioning creates
  `clinozy_be_maintenance` as a `LOGIN NOBYPASSRLS` user on each environment's branch
  before the first deploy (next to `clinozy_be_app` and `clinozy_be_migrator` — see
  [Database runtime role](resource-limits.md#database-runtime-role-row-level-security-safety))
  and writes `DATABASE_MAINTENANCE_URL` (pooled host).
- `DATABASE_MAINTENANCE_URL` (optional env var) selects the pool: unset → maintenance
  contexts use the shared `DATABASE_URL` pool exactly as before; set → they use a lazy
  second pool built from the same tuned options
  ([`connection.ts`](../../../src/infrastructure/database/connection.ts) →
  `getMaintenanceDatabase()`).
- Bypass policy arms still accept the `app.*` GUCs from any role. Tightening is the
  final step below.

## Operator steps (per environment)

1. Create the login on the environment's Postgres — clinozy-infra's Neon provisioning
   does this via SQL as `neondb_owner` (never the Neon console/CLI/REST API, which add
   `BYPASSRLS`), before the first deploy:

   ```sql
   CREATE ROLE clinozy_be_maintenance LOGIN PASSWORD '<generated>';
   -- or, when an earlier migrate already created it NOLOGIN:
   ALTER ROLE clinozy_be_maintenance LOGIN PASSWORD '<generated>';
   ```

2. Set `DATABASE_MAINTENANCE_URL` for the environment (same pooled host/database as
   `DATABASE_URL`, user `clinozy_be_maintenance`) — clinozy-infra writes it into
   `.env.<environment>`; `pnpm github:sync` pushes it.

3. Deploy and verify workers: retention/cleanup jobs must keep succeeding (they now run
   on the maintenance pool).

4. **Only after every hosted environment has completed 1–3**: ship the arm-tightening
   migration adding `current_user = 'clinozy_be_maintenance'` to the bypass policy arms
   (`app.global_retention_cleanup`, `app.session_retention_cleanup`, `app.global_admin`,
   `app.system_audit_insert`, `app.audit_outbox_drain`) and update the
   `rls-table-scope-map` expectations. From then on a compromised `clinozy_be_app`
   connection cannot use a bypass GUC at all.

## Local parity provisioning (all roles)

Local mirrors live: migration `20260827050000` creates `clinozy_be_owner` /
`clinozy_be_migrator` / `clinozy_be_operator` and moves table ownership to the owner group.
Local provisioning (once, as the compose superuser):

```sql
ALTER ROLE clinozy_be_app LOGIN PASSWORD '<generated>';
ALTER ROLE clinozy_be_operator LOGIN BYPASSRLS PASSWORD '<generated>';
ALTER ROLE clinozy_be_migrator LOGIN CREATEROLE PASSWORD '<generated>';
```

Then the gitignored local env file carries `DATABASE_URL` as `clinozy_be_app` (runtime
parity), `DATABASE_OPERATOR_URL` as `clinozy_be_operator` (harness + full/bulk seeds pick
it up automatically), and `DATABASE_MAINTENANCE_URL` as `clinozy_be_maintenance`.
`DATABASE_MIGRATION_URL` points at `clinozy_be_migrator` for day-to-day migrations; the
compose superuser is needed ONLY for a fresh clone's very first `pnpm db:migrate`
(before the roles exist) and is otherwise used by nothing. `DATABASE_OPERATOR_URL` is
NEVER set in hosted environments.

## Fresh database / recreate provisioning (disaster or reset)

Migrations are the complete source of truth from zero — schemas, tables, every
FORCE-RLS policy, the five roles, ownership, and grants all materialize from one
cold `pnpm db:migrate` (proven by the local scratch rebuild and the nightly CI
canary). A deleted-and-recreated database therefore needs exactly three steps:

1. **Logins** — hosted: re-run clinozy-infra's Neon provisioning. It creates
   `clinozy_be_app`, `clinozy_be_maintenance` and `clinozy_be_migrator` (with the
   migrator's database / `public` / ADMIN grants) on the new branch and rewrites the three
   URLs — on Neon a recreated database usually means a new host (direct host, no
   `-pooler`, for the migration URL); `pnpm github:sync` any changed secrets. Passwords
   are per-environment secrets, never in committed SQL.
2. **Migrate** — hosted: the deploy's `pnpm db:migrate` runs as `clinozy_be_migrator`,
   the very first run on the empty database included — the provider owner is not
   needed. The migrations skip the three users that already exist and create the rest
   (`clinozy_be_owner`, `clinozy_be_operator`) `NOLOGIN`. Local: the compose superuser
   runs the first `pnpm db:migrate`, then re-run the `ALTER ROLE … LOGIN PASSWORD` steps
   above.
3. **Data** — reference data returns via `pnpm db:seed`; tenant/billing rows do
   not, and external state (e.g. Stripe customers pointing at vanished internal
   rows) needs reconciliation. Treat recreate as a provisioning event, not a
   redeploy.

## Nightly CI parity canary

`.github/workflows/scheduled-rls-parity.yml` re-runs the DB suites every night with this
exact role posture provisioned in CI (operator fixtures, RLS-subject maintenance pool,
`SET LOCAL ROLE clinozy_be_app` suites) — a policy/plan regression that only bites
RLS-subject roles opens a `ci-failure` issue by morning instead of surfacing at deploy.

## Related

- Bypass-kind registry + per-path usage allowlists:
  `MAINTENANCE_CONTEXTS` in `database-context.ts`,
  `src/tests/unit/infrastructure/database/maintenance-context-confinement.policy.unit.test.ts`
- Per-table policy GUC lock:
  `src/tests/unit/infrastructure/database/rls-table-scope-map.db.unit.test.ts`
