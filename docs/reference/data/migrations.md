# SQL migrations (clinozy-be)

How schema changes ship, how CI guards them, and how to validate **rollback** without applying destructive DDL in production.

---

## Layout

| Path | Role |
| ---- | ---- |
| `migrations/*.sql` | Ordered, forward-only SQL applied by `pnpm db:migrate` |
| `src/domains/**/<resource>.schema.ts` | Drizzle definitions — must stay aligned with migrations |
| `src/scripts/validators/migration/lint-migrations.ts` | CI gate (`pnpm db:migrate:lint`) — destructive DDL, RLS, naming |

See **be-db-migration-maintainer** skill and [data-lifecycle-deletion.md](../data/data-lifecycle-deletion.md) when retention or `deleted_at` changes.

### Source of truth — no Drizzle Kit snapshot in `migrations/`

The authoritative migration set is the hand-written, **timestamp-named** `migrations/*.sql` files, applied by `pnpm db:migrate` (`src/infrastructure/database/migration/migrate.ts`) and recorded in the `public.schema_migrations` table. Drizzle Kit's snapshot/journal (`meta/_journal.json`, `*_snapshot.json`) are **not** part of this — they use a sequential `0000`/`0001` index that collides when two developers branch in parallel, which is the exact problem the timestamp prefix avoids.

`drizzle.config.ts` therefore points `out` at `./drizzle/` (gitignored scratch). `pnpm db:generate` is a **drafting aid only**: it writes a full diff there; copy what you need into a `pnpm db:migrate:new <slug>` file and discard the scratch output. Never commit a `migrations/meta/` folder, and never apply from `./drizzle/`.

---

## Migration filename ordering

Each up migration file is named `YYYYMMDDHHMMSS_snake_case.sql`. The **14-digit prefix is a real UTC wall-clock timestamp** (`YYYYMMDDHHMMSS`), not a counter. Using the actual time of day means two developers branching off the same dev tip naturally land on different prefixes and avoid the trivial merge conflict that comes from sequential `_000001 / _000002` suffixes.

- Applied migrations are recorded in `public.schema_migrations` by **filename** — never rename merged files. Renaming makes the runner treat the file as a new migration and re-apply it in environments that already had it.
- The prefix must be **strictly greater** than every existing up migration (`pnpm db:migrate:lint` enforces monotonic order).
- Historical mixes (e.g. `202502*` early schema, then `202605*` with `_000001` counter suffixes) are valid; ordering is by prefix only. Leave existing files alone.
- **Do not** rely on `date -u +%Y%m%d000001` or any other counter pattern — that re-introduces the merge-conflict problem. Use the generator below.

**Create a new migration (preferred):**

```bash
pnpm db:migrate:new add_my_table
# → creates migrations/<YYYYMMDDHHMMSS>_add_my_table.sql with a header template
```

**Inspect the next prefix without creating a file:**

```bash
pnpm db:migrate:next-prefix add_my_table
# → prints current max, next prefix, and example filename
```

Both helpers share the same logic: the prefix is always the real UTC `YYYYMMDDHHMMSS` wall clock — there is no counter/increment fallback. Monotonic ordering is enforced separately by `pnpm db:migrate:lint`. Author SQL in the generated file and run the lint.

---

## Forward apply (local / CI)

```bash
pnpm db:migrate:lint   # safety rules
pnpm db:migrate        # apply pending files
pnpm db:migrate:dry-run  # print SQL without applying (when debugging)
```

CI and `pnpm verify:base` run migrate against ephemeral Postgres before API smoke tests.

### Connection URL — direct (non-pooler) only

The runner serializes the whole migration run behind a session-level `pg_advisory_lock` so two concurrent deploys cannot double-apply a file. That lock is only meaningful on a connection pinned to a single Postgres backend, so `pnpm db:migrate` **fails fast** when `DATABASE_MIGRATION_URL` (or the `DATABASE_URL` fallback) is a transaction-mode pooler — a `-pooler` host or `?pgbouncer=true`. Point `DATABASE_MIGRATION_URL` at the **direct** database host (Neon's non-pooler endpoint); only `DATABASE_URL` used by the API/worker runtime should use the pooled endpoint.

---

### Lock and statement timeouts

A DDL statement waiting for a lock holds its place in that table's lock queue, so every later query
on the table queues behind it — an outage for as long as the wait. The runner
([`migration-lock-timeout.ts`](../../../src/infrastructure/database/migration/migration-lock-timeout.ts))
therefore bounds every migration:

| Lane | `lock_timeout` | `statement_timeout` | On a lock timeout (SQLSTATE 55P03) |
| ---- | -------------- | ------------------- | ---------------------------------- |
| Transactional (default) | 5 s (`SET LOCAL`) | 5 min (`SET LOCAL`) | the file rolls back and is retried, 3 attempts in all, 3 s apart |
| Non-transactional (`CREATE INDEX CONCURRENTLY`) | 5 s (session) | none — long index builds block no writes | the run fails; drop the INVALID index and re-run |

A migration that genuinely needs longer than 5 minutes inside its transaction is a backfill too big
for one transaction or a table rewrite the lint should have caught — split it, or move the long part to
the non-transactional lane. Pinned by `migration-lock-timeout.unit.test.ts` and,
against a real held lock, `migration-lock-timeout.db.unit.test.ts`.

## Non-transactional migrations (`CREATE INDEX CONCURRENTLY`)

By default the runner wraps **each migration file in a single transaction** — DML and most DDL apply atomically and roll back automatically on a mid-file error. A few statements cannot run inside a transaction, most importantly `CREATE INDEX CONCURRENTLY`, which is the zero-downtime way to add an index: plain `CREATE INDEX` takes a `SHARE` lock that **blocks all writes** for the build duration (minutes on a large high-write table such as `audit.logs`).

Opt a migration into the non-transactional lane with a header in the first 20 lines, and separate **every** statement with `--> statement-breakpoint` so the runner sends each one to Postgres independently:

```sql
-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY cannot run inside a transaction"

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org_created_id
  ON audit.logs (organization_id, created_at, id);
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created_id
  ON notify.notifications (user_id, created_at, id);
```

Rules and guardrails (enforced by `pnpm db:migrate:lint`):

- **`CREATE INDEX CONCURRENTLY` requires** the `migration-transaction: none` header — otherwise it would fail at apply time inside the wrapping transaction (`concurrent_index_requires_non_transactional`, **non-overridable**).
- **Separate every statement with `--> statement-breakpoint`.** The runner sends each breakpoint segment as one command; two statements in a segment form an implicit transaction, and `CREATE INDEX CONCURRENTLY` cannot run inside one. The linter flags a segment that holds more than one statement (`non_transactional_statements_need_breakpoints`, **non-overridable**).
- **Every statement must be idempotent** (`IF NOT EXISTS`). There is no enclosing transaction, so a statement that fails mid-file is not rolled back; re-running `pnpm db:migrate` re-executes the file from the top.
- **One concern per file.** Keep non-transactional migrations to index DDL only; put DML and constraint changes in separate (transactional) migrations.
- After a non-transactional migration, the runner **checks for `INVALID` / unready indexes** (the signature of a concurrent build that aborted) and refuses to record the migration as applied. If this fires, drop the broken index (`DROP INDEX CONCURRENTLY IF EXISTS <schema>.<name>`) and re-run `pnpm db:migrate`.

### Append-heavy tables (`audit.logs`, `notify.notifications`)

These tables are **plain (non-partitioned)** tables. Growth is bounded by row-level retention workers (`audit-retention`, `notification-retention`) that batch-`DELETE` rows older than the configured window — there is no partition lifecycle to maintain. New indexes on these tables follow the same rules as any other high-write table: prefer `CREATE INDEX CONCURRENTLY` in a non-transactional migration. The composite keyset indexes added in [`20260520000006_keyset_pagination_indexes.sql`](../../../migrations/20260520000006_keyset_pagination_indexes.sql) were created with a plain `CREATE INDEX` only because the baseline seeds those tables empty (instant build, before any live traffic).

### Since the first release

Production has held data since v9.4.1 (2026-10-25). A migration protects it:

- **Never edit a merged migration** — development applies every merged file, and the runner records each
  applied file by name, so an edit reaches fresh databases only and the environments drift. Fix forward
  with a new file (`be-db-migration-maintainer-sync.mdc`: "Applied migrations are immutable").
- **A new column carries its data.** Add it nullable (or with a default), fill the existing rows in the
  same migration, then constrain it (`NOT VALID` + `VALIDATE`, then `SET NOT NULL`). A column that a
  read path depends on is filled before that read ships — `20261101090000_upload_record_binding.sql`
  shipped without its fill and cost every existing attachment its view link until
  `20261104043912_upload_record_binding_backfill.sql`.
- **A fill runs as data, not as the migrator.** The migrator is RLS-subject, so the statement that reads
  or writes a FORCE RLS table sits between `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` and `FORCE ROW
  LEVEL SECURITY` in a transactional file (lint rule `force_rls_data_migration_without_owner_bracket`;
  models: `20261030103639_leads_closed_at.sql`, `20261104043912_upload_record_binding_backfill.sql`).
  `NO FORCE` takes ACCESS EXCLUSIVE until commit, so keep the fill to one statement per table.
- **Every constraint a release adds must still accept what the previous release writes** — see expand /
  contract below.

### Previous-release write compatibility (expand phase of the v9.4.1 → next release)

Four migrations of the release after v9.4.1 refuse writes v9.4.1 still makes, and one leaves the records it
writes without the upload binding the new release reads. v9.4.1 keeps writing while the migrations apply
and the containers swap, and again after a rollback, so
[`20261104043911_previous_release_write_compatibility.sql`](../../../migrations/20261104043911_previous_release_write_compatibility.sql)
completes each such write in the new shape. Every trigger fires only on a shape the new release never
writes; a raw write that breaks a rule on purpose is still refused.

| Trigger (`app.`) | Fills | For the constraint of |
| ---------------- | ----- | --------------------- |
| `trg_<record>_bind_upload_keys_for_previous_release` on `patient_images`, `patient_reports`, `patient_reviews`, `contact_activities`, `payments` | binds the record's confirmed, unbound keys to it | `20261101090000_upload_record_binding` (read links) |
| `trg_leads_closed_at_for_previous_release` | `closed_at` on a status change into / out of a closing status | `chk_leads_closed_at` |
| `trg_medical_purchase_order_items_fill_for_previous_release` | a new line's GST (its medicine's rate, inclusive) and its order's split; received = ordered on a line marked received | `NOT NULL` GST columns, `chk_medical_purchase_order_items_amount`, `chk_medical_purchase_order_items_received` |
| `trg_medical_purchase_orders_split_for_previous_release` | `taxable_total` / `gst_total` when only `total` was written | `chk_medical_purchase_orders_totals` |
| `trg_contacts_date_of_birth_for_previous_release` | `date_of_birth_is_approximate = false` when the date is cleared | `chk_contacts_date_of_birth_approximate` |

Tests: `src/domains/app/__tests__/integration/app-previous-release-writes.integration.test.ts` (each
v9.4.1 write, replayed) and `app-upload-binding.integration.test.ts` (binding on the old write, and the
backfill). **Contract (follow-up):** once the new release is live and a rollback to v9.4.1 is ruled out,
one migration drops the nine triggers and the five `app.fn_*_for_previous_release()` functions, and the
previous-release suite goes with it.

### Long-held locks in the release after v9.4.1

`20261101100000_user_erasure_attribution_set_null.sql` (109 foreign keys re-added) and
`20261101101100_tenant_composite_foreign_keys.sql` (33) each drop and re-add their foreign keys and
`VALIDATE` them in one transaction. `DROP CONSTRAINT` on a foreign key takes ACCESS EXCLUSIVE on the child
and on the referenced table — `auth.users` among them, from the first statement — and holds it until
commit, so sign-in and every query on those tables wait for the whole file (the "no long lock" in the
first file's header is wrong; the file is applied, so it stays as written).

Measured locally (Postgres 17, warm cache), re-running each file's work in one transaction: 0.80 s and
0.27 s on the `seed:full` data set, 0.84 s and 0.30 s after `BULK_PROFILE=load pnpm db:seed:bulk` (709 k
rows; the tables these files validate stay small there), and one foreign-key `VALIDATE` over 395 k rows
took 45 ms. At production's size the hold is about a second; the larger risk is the wait for each lock:
a long-running transaction on any of the 64 tables they validate, or a table they reference, makes the file wait up to the 5 s `lock_timeout`
while it already holds `auth.users`, up to three attempts. Deploy these two files off-peak, with no long
transaction open (`SELECT pid, now() - xact_start, state, query FROM pg_stat_activity WHERE xact_start <
now() - interval '5 seconds'`), and expect sign-in to pause for a few seconds at worst.

### Expand / contract (keep deploys backward-compatible)

Production runs `pnpm db:migrate` **before** the new application version is rolled out, while the old version still serves traffic. Schema changes must therefore stay compatible with the **currently running** code:

1. **Expand** — add the new index/column/table (additive, backward-compatible). Index additions go in a `migration-transaction: none` migration so writes are never blocked.
2. **Migrate code** — deploy the version that reads/writes the new shape.
3. **Contract** — in a *later* migration (after the old version is fully gone), drop the now-unused column/constraint.

---

## Rollback testing approach

Production deploys are **forward-only**: we do not run automatic down migrations on Railway. Rollback validation is done **before merge** using one of these patterns:

### 1. Neon branch rehearsal (recommended)

1. Create a disposable Neon branch from `production` in project `clinozy-be-production` — prefer `--schema-only` so no patient rows are copied (use a full branch only when the migration backfills data). A branch of the protected `production` branch gets **new role passwords**, so take its URL from `neonctl connection-string <branch> --project-id <id>`, never from `.env.production`.
2. Apply the PR migration: `DATABASE_URL=<branch> pnpm db:migrate`.
3. Run targeted Vitest integration tests and `pnpm test:api-smoke` against the branch.
4. **Simulate rollback** by restoring the branch to a PITR timestamp **before** the migration (Neon console) or by creating a fresh branch from the old snapshot.
5. Redeploy application code at the **previous git tag** against the restored branch and re-run smoke tests.

This validates **RPO/RTO** assumptions in [dr-runbook.md](../../process/dr-runbook.md) without mutating production.

### 2. Local two-step apply

1. `pnpm compose:up && pnpm compose:wait`
2. Migrate to revision *N*: `pnpm db:migrate`
3. Capture schema dump: `pg_dump --schema-only … > /tmp/before.sql`
4. Apply revision *N+1* (the PR migration).
5. Confirm app tests pass at *N+1*.
6. **Logical rollback**: reset DB (`docker compose down -v`, up, migrate only through *N*) and confirm the previous app commit still works — proves the old code path does not require new columns.

### 3. Compensating migration (production rollback)

When a migration already reached production and must be reversed:

1. Ship a **new** forward migration that undoes the effect (drop column added in error, restore constraint, etc.).
2. Never edit merged `migrations/*.sql` files.
3. Run `pnpm db:migrate:lint` with explicit `--allow-destructive` only when architect-approved.

---

## Transaction rollback (CI)

Postgres transaction rollback for multi-write helpers is covered in CI by the integration suite:

```bash
pnpm test:integration
```

(`src/tests/integration/database/transaction-rollback.integration.test.ts` — asserts `withTransaction` rolls back on error and commits on success.) This is **not** SQL migration rollback.

---

## Automated migration rollback test stub (future)

A dedicated Vitest project (`migrations-rollback`) is **not** wired in CI today — Neon branch rehearsal is the supported path. If we add automation later, it should:

- Spin up Testcontainers Postgres
- Apply `migrations/` through file *N*, run a minimal schema assertion
- Apply *N+1*, assert new invariant
- Reset volume and re-apply through *N* only, assert old invariant

Until then, document rollback evidence in the PR (Neon branch name + smoke command output).

---

## ER diagram (dbdiagram.io)

Regenerate [DBML](https://dbml.dbdiagram.io/docs) from **all** `migrations/*.sql` (replay in filename order):

```bash
pnpm tool:generate-dbdiagram
```

Output: [`docs/database/clinozy-be.dbml`](../../database/clinozy-be.dbml) — import at [dbdiagram.io](https://dbdiagram.io/) (File → Import).

The file includes:

- **Primary keys** (`pk`, `increment`, and composite `indexes { ... [pk] }` where defined)
- **Foreign keys** as `Ref:` lines with `delete: cascade | restrict | set null` where defined in SQL
- **RLS** as per-table `Note` blocks (policies from `CREATE POLICY` migrations)
- **TableGroup** per Postgres schema (`auth`, `tenancy`, `billing`, …)

Dropped tables from earlier schema consolidations are omitted from the cumulative model — Stripe is the source of truth for billing documents and payment instruments.

---

## Related commands

| Command | Purpose |
| ------- | ------- |
| `pnpm db:migrate:lint` | Block unsafe DDL in CI |
| `pnpm db:migrate:new <slug>` | Create new migration file with real-time `YYYYMMDDHHMMSS` prefix |
| `pnpm db:migrate:next-prefix` | Print next filename prefix after current max |
| `pnpm db:migrate:dry-run` | Inspect pending SQL |
| `pnpm db:sequences:advance` | After a point-in-time restore, jump every id sequence past the lost window ([dr-runbook.md](../../process/dr-runbook.md#advance-the-id-sequences-after-a-restore)) |
| `pnpm tool:generate-dbdiagram` | Regenerate `docs/database/clinozy-be.dbml` for dbdiagram.io |
| `pnpm verify:base` | migrate → seed → API smoke |
