`src/scripts/seed/`

# Seed orchestrator

## Purpose

One configurable, reproducible seeding tool that populates the database from a small coherent demo set up to tens of thousands of rows, exhaustively across every domain — so list/pagination/filter endpoints, `audit.logs` time ranges, and demo/staging tenants all have realistic data. This directory owns the shared orchestrator and the seed contract; the actual row-writing logic lives in each domain's co-located `seed/` directory, never here.

## Three tiers (one code path)

All three share the contract and the per-domain seeders:

- **`pnpm db:seed`** (`minimal.ts`) — reference/bootstrap data only (permission codes, plans). No users or organizations needed for the app to boot.
- **`pnpm db:seed:full`** (`full.ts`) — a small fixed demo set plus the cross-domain flows that exercise the API (add user to organization, send invite).
- **`pnpm db:seed:bulk`** (`bulk.ts`) — scaled volume via profiles, for load/pagination testing and full demo tenants.

**`pnpm db:seed:demo-clinic`** (`demo-clinic.ts`, run by `db:seed:full` too) — one real-looking skin & hair clinic for working in the app. It has two branches, five staff who can sign in, 24 patients, six weeks of visits, notes, treatments, bills and payments, enquiries with their WhatsApp threads, and today's floor in every lane.

- `demo-clinic.plan.ts` builds the story as data. It is a pure function of a seeded `fakerEN_IN` (`SEED`), today and the clinic's clock, and is unit-tested.
- `demo-clinic.catalog.ts` holds what Faker cannot supply: clinic names, real city areas and PIN codes, the price list, and a dermatologist's wording.
- The script writes the plan through each sub-domain's `seed/` helpers, then runs the clinic's task rules once, so the open rule tasks are the app's own.
- Everything looks real except the emails, which stay on `example.com`. `demo@example.com` joins as an Admin.
- A clinic already seeded under the plan's slug is kept. `--fresh` deletes it and seeds it again around today (local databases only, `assertBulkSeedAllowed`).

Alongside them, **`pnpm db:seed:stripe-catalog`** (`stripe-catalog.ts`, the sync in `stripe-catalog-sync.ts`) prices the paid plans in a Stripe sandbox: their product and monthly and yearly prices, found again by lookup key on a re-run, with the ids recorded on the plans. Test-mode keys only; Free gets no price.

## Contract — `seed-contract.ts`

- **`SeedContribution`** — `{ seedReference?(ctx), seedBulk?(ctx) }`; both hooks optional. Exported by every sub-domain / nested sub-domain `seed/index.ts`.
- **`DomainSeedModule`** — `SeedContribution` + `name` + `dependsOn?` (cross-domain bulk ordering) + required `seedBulk`. Exported only by a top-level domain's `seed/index.ts`; the only unit the orchestrator registers.
- **`composeContributions(...)`** — folds children up the tree (nested sub-domain → sub-domain → domain): runs each part's `seedReference` first, then each part's `seedBulk`.
- **`orderModules(...)`** — topologically orders domain modules by `dependsOn`.
- **`SeedContext`** — `{ counts, faker, registry, logger }` handed to every seeder.
- **`SeedRegistry`** — cross-domain parents. The user and tenancy bulk seeders append created users/organizations; downstream domains (billing, notify, upload, audit) read them. Each domain seeds **only its own tables** — cross-domain wiring lives only here, never inside a domain seeder.

## Orchestrator and config

- **`bulk.ts`** — `MODULES` (one `DomainSeedModule` per domain), `runBulkSeed` (guard → resolve config → all `seedReference`, then all `seedBulk` in `dependsOn` order), `closeDatabase()` in `finally`.
- **`bulk-config.ts`** — `PROFILES` (`demo` / `edge` / `load`) and `resolveCounts` (`BULK_PROFILE`, `SCALE` multiplier, per-knob `BULK_ORGS` / `BULK_USERS_PER_ORG` / `BULK_AUDIT_MONTHS` / `BULK_AUDIT_PER_ORG_PER_MONTH`). `HARD_CAP` keeps a run in the tens-of-thousands band — exceeding it is a fatal config error (the COPY-based load path is out of scope).
- **`production-guard.ts`** — `assertBulkSeedAllowed`: refuses on a non-loopback `DATABASE_URL` unless `ALLOW_BULK_SEED=1` (a deliberate override; no script passes it).
- **`seed-registry.ts`** — in-memory `createSeedRegistry()`.
- **`faker-data.ts`** — `initFakerSeed()` and shared faker helpers. **`helpers.ts`** — re-exports such as `closeDatabase`.

Dependency order: `user` → `tenancy` → `billing` / `notify` / `upload` / `audit`. `seedReference` runs for all domains before any `seedBulk`.

## Determinism and idempotency

- `SEED` pins faker (`initFakerSeed()`) so a given seed reproduces the same data.
- Re-running any tier is a no-op for existing rows. Two patterns:
  - **`onConflictDoNothing()`** — use when the row is the source of truth and no fields need refreshing (bulk-seeded rows, reference codes, role-permission join rows).
  - **`onConflictDoUpdate({ target, set })`** — use for demo seed helpers where fields must stay current on re-run (e.g. `password_hash`, `first_name`, `last_name` in `seedUser`; `name` in `seedOrganization`). For unique indexes with a `WHERE` clause (partial indexes), also supply `targetWhere: sql\`${table.deleted_at} IS NULL\`` so Drizzle can resolve the correct index.
- Natural keys are deterministic (slug/email from faker + index); high-count tables (`audit.logs`, notifications) use batched multi-row inserts with `ON CONFLICT DO NOTHING`.

## Usage

```bash
pnpm db:seed                              # reference only
pnpm db:seed:full                         # fixed demo set (+ the demo clinic)
pnpm db:seed:demo-clinic                  # the demo clinic alone (kept if already seeded)
pnpm db:seed:demo-clinic --fresh          # delete and re-seed it around today (local only)
pnpm db:seed:bulk                         # demo profile (default)
BULK_PROFILE=load SCALE=5 pnpm db:seed:bulk
BULK_PROFILE=edge BULK_ORGS=200 pnpm db:seed:bulk
pnpm db:seed:stripe-catalog               # sandbox prices for the paid plans (after db:seed)
pnpm db:seed:stripe-catalog --dry-run     # say what it would create; write nothing
```

## Failure modes

- **Hosted / production `DATABASE_URL`** → `assertBulkSeedAllowed` throws before any write (override only with `ALLOW_BULK_SEED=1`). The demo clinic's `--fresh` asks it before deleting the clinic.
- **Demo clinic records fail mid-way** → they roll back together (one transaction in the clinic's context). The logins, organization and memberships written before them stay, and `--fresh` replaces them.
- **Counts exceed `HARD_CAP`** → fatal config error pointing at the out-of-scope COPY path.
- **Unknown `BULK_PROFILE` / invalid integer env / dependency cycle in `dependsOn`** → throws during config resolution or `orderModules`.
- **Empty parent pool** (e.g. tenancy runs before user) → the seeder warns and returns early rather than writing orphaned rows.

## Related

- Convention rule: `.cursor/rules/be-seed-conventions.mdc`.
- Skill: `.cursor/skills/be-seed-maintainer/SKILL.md`.
- Canonical per-domain examples: `src/domains/user/seed/`, `src/domains/tenancy/seed/`.
