# Testing conventions (clinozy-be)

Vitest, `fastify.inject()`, domain co-located tests, and naming tiers. For manual smoke after seed, see [api-testing.md](../../getting-started/api-testing.md).

---

## HTTP test stack

- **Vitest** — runner, assertions, coverage (`pnpm test`, `pnpm test:unit`, `pnpm test:e2e`, …)
- **`fastify.inject()`** — in-process HTTP via `injectRoute` / `injectAuthenticated` in `src/tests/helpers/test-http-inject.helper.ts` and `createTestApp()` in `src/tests/helpers/test-app.ts`
- **Smoke** — native `fetch()` against `SMOKE_BASE_URL` under `src/tests/smoke/*.smoke.test.ts`

Use `injectWithCookies` when session cookies matter.

**Mutation testing:** Stryker on auth/billing/tenancy services and security middleware — see [mutation-testing.md](mutation-testing.md). Run `pnpm test:mutation` locally before changing `stryker.config.json` thresholds.

**Property-based tests:** `*.property.unit.test.ts` under `src/tests/unit/validators/` and `src/tests/unit/property-based/` using [fast-check](https://fast-check.dev/). Run `pnpm test:property` (CI uses `FAST_CHECK_NUM_RUNS=50` and shared shrink budget via `propertyAssertOptions()` in `src/tests/helpers/fast-check-property.util.ts`).

---

## Tests vs routes

**With routes vs without routes decides HTTP registration only — not test placement.**

| Sub-domain kind    | Routes                      | Tests live at                              |
| ------------------ | --------------------------- | ------------------------------------------ |
| **With routes**    | Own `<resource>.routes.ts`  | `sub-domains/<resource>/__tests__/`        |
| **Without routes** | Parent/domain `*.routes.ts` | `sub-domains/<resource>/__tests__/` (same) |

Bundled suites (`billing/__tests__/integration/`) and parent **e2e** (`tenancy/__tests__/e2e/`) are additive — they do not replace sub-domain `__tests__/`.

---

## Test layout

Vitest tests live under `src/` in **two places only**.

### 1. `src/tests/` — cross-cutting

```text
src/tests/
  helpers/          # test-app, test-auth, test-database, test-organization
  factories/        # shared factories
  unit/             # shared utils, errors, event-bus only
  integration/      # cross-domain HTTP contracts
  security/         # auth, CORS, JWT, RLS, rate limits
  performance/      # N+1, concurrency
  global/           # route catalog, domain consistency
  chaos/            # Toxiproxy (see chaos-testing.md)
  contract/         # outbound HTTP contracts
  smoke/            # deployed URL fetch tests
```

Do not put full domain route suites here.

### 2. `src/domains/<domain>/` — domain-owned

Never place `*.test.ts` directly under `__tests__/` — use `integration/`, `unit/`, or `e2e/`.

```text
src/domains/<domain>/__tests__/
  integration/<domain>.integration.test.ts
  e2e/<flow>.e2e.test.ts
  unit/
  factories/

src/domains/<domain>/sub-domains/<resource>/__tests__/
  integration/<resource>.integration.test.ts
  unit/<resource>.<layer>.unit.test.ts
  unit/events/                    # handlers, emit, worker mocks
```

### k6 load

`src/tests/load/k6/` (`.js` only). See [load-testing.md](../testing/load-testing.md).

---

## Testing pyramid

| Layer                  | Command                 | Use for                                   |
| ---------------------- | ----------------------- | ----------------------------------------- |
| **Unit**               | `pnpm test:unit`        | Pure logic, no DB/Redis                   |
| **Integration**        | `pnpm test:integration` | Cross-domain in-process contracts         |
| **Domain integration** | `pnpm test:e2e`         | `src/domains/**/__tests__/integration/**` |
| **Security**           | `pnpm test:security`    | Auth, CORS, JWT, RLS                      |
| **RLS application role** | `pnpm test:rls-role`  | The e2e + integration lanes, on an RLS-subject connection |
| **Performance**        | `pnpm test:performance` | N+1, concurrency                          |
| **Load**               | `pnpm load:*`           | k6 against running API                    |
| **Smoke**              | `pnpm test:api-smoke`   | Live API after seed                       |
| **Global**             | `pnpm test:global`      | Route catalog, consistency                |
| **Coverage**           | `pnpm test:coverage`    | Full suite + Stage 5 thresholds           |

### Why `pnpm test:rls-role` exists

Every other lane connects with a role that **bypasses** row-level security: Compose creates
`POSTGRES_USER: clinozy` as a superuser, and the local operator role carries `rolbypassrls`. So a
path that reaches a FORCE RLS table **without a database context** matches no policy arm, reads
zero rows, and reports success — and looks green everywhere it is tested. That is not
hypothetical: organization and account deletion tombstoned no uploads for months that way.

The `RLS security (non-superuser)` job covers the other half. It asserts what the *policies*
permit, using helpers that opt into `clinozy_be_app` per statement. What it cannot see is whether
the *application* obeys them, because the connection underneath is still the superuser.

`pnpm test:rls-role` opens the pool under test as `clinozy_be_app` for the whole connection, so the
role applies to every statement — including ones inside the application's own transactions.

**Fixtures use the operator connection.** `src/tests/helpers/operator-database.ts` exists
because the harness does things the application never does: `TRUNCATE`ing every table between
suites, and seeding deliberately cross-tenant rows. Without the split the suites die on
`permission denied for table users` inside `cleanupDatabase` before asserting anything. The two
root factories (`user.factory.ts`, `organization.factory.ts`) deliberately do **not** use it —
they insert through the same context the application uses, because "can this row be created the
way production creates it" is worth asserting for the two tables every other fixture hangs off.

**Raw SQL in a test** goes through Drizzle, as in the application: ``database.execute(sql`…`)``
(`sql` from `drizzle-orm`), or ``getOperatorDatabase().execute(sql`…`)`` for work the application role
may not do. node-postgres returns a result object, so read the rows with the file's local
`rowsOf<T>(result)` helper (the `Array.isArray(result) ? result : result.rows` normalizer the
repositories use). A test that needs a raw client — holding a lock across statements, terminating a
backend — takes one from `getOperatorPool()`.

A test that passes normally and fails under this runner is depending on an RLS bypass — either
the code is missing a context, or the fixture is writing somewhere it should not. Both are worth
knowing. When it is the fixture, the symptom is a silent zero-row write, which reads as an
application bug: a soft-delete that updated nothing made a switch-organization test look like an
authorization hole until the fixture was moved onto the operator connection.

`e2e` and `integration` are covered. `security` is deliberately not: its RLS suites switch roles
themselves — per statement into `clinozy_be_app`, or into `clinozy_be_owner` to run a migration the way
the migrator does — and a connection that already *is* `clinozy_be_app` cannot `SET ROLE` to
anything else. That half belongs to the `RLS security (non-superuser)` job.

```bash
pnpm test:rls-role
```

---

## Filename suffixes (CI: `pnpm validate:test-naming`)

| Suffix                  | Example                               |
| ----------------------- | ------------------------------------- |
| `*.unit.test.ts`        | `subscription.validator.unit.test.ts` |
| `*.integration.test.ts` | `auth.integration.test.ts`            |
| `*.e2e.test.ts`         | `email-login-flow.e2e.test.ts`        |
| `*.smoke.test.ts`       | `health.smoke.test.ts`                |

The suffix decides the folder, and the folder decides whether the suite runs at all: each Vitest
project collects only its own folders (`tooling/vitest/projects.ts`). A `*.unit.test.ts` lives under
`__tests__/unit/` or `src/tests/unit/`; a `*.integration.test.ts` under `__tests__/integration/` or
`src/tests/integration/`; `*.db.unit` and `*.property.unit` suites may live anywhere under `src/`
(their projects collect them anywhere). `pnpm validate:test-naming` fails on any other placement — a
file outside every project's folders is collected by none and never runs, which is how seven unit
suites (the mail worker and DLQ auto-retry worker among them) went unexecuted.

---

## API version in tests (CI: `pnpm validate:test-api-prefix`)

Vitest `inject()` URLs must not hardcode `/api/v1/` (or any `/api/vN/`). Use `testApiPath()` from `src/tests/helpers/test-api-prefix.helper.ts`, which builds paths from `buildPublicApiPrefix()` / `PUBLIC_API_VERSION_SEGMENT_V1` (same as production routing).

| Location                                                    | Literal `/api/v1/...`                    |
| ----------------------------------------------------------- | ---------------------------------------- |
| `inject({ url: ... })` and inject helpers                   | **No** — use `testApiPath('/users/me')`  |
| `describe` / `it` titles                                    | **Yes** — labels only                    |
| Route registration in unit tests (`app.get('/api/v1/...')`) | **Yes** — mirrors real plugin paths      |
| Smoke `fetch()` / manual curl in docs                       | **Yes** — external callers use full URLs |

```typescript
import { testApiPath } from "@/tests/helpers/test-api-prefix.helper.js";

await injectAuthenticated(app, {
  method: "GET",
  url: testApiPath(
    `/tenancy/organizations/${organizationPublicId}/memberships`,
  ),
  token,
  organizationPublicId,
});
```

See also [api-versioning.md](../api/api-versioning.md).

---

## What to unit-test vs not

### Always unit-test when adding/changing

| Artifact           | Location                               |
| ------------------ | -------------------------------------- |
| `*.validator.ts`   | Domain or sub-domain `__tests__/unit/` |
| `*.serializer.ts`  | Same                                   |
| `shared/utils/**`  | `src/tests/unit/utils/`                |
| `shared/errors/**` | `src/tests/unit/errors/`               |

### Prefer integration (not unit) for

| Artifact     | Why                    |
| ------------ | ---------------------- |
| Services     | DB, RLS, cross-domain  |
| Repositories | Drizzle + Postgres     |
| Controllers  | Covered by route tests |

### Workers

- **Unit**: extracted pure logic only (`__tests__/unit/events/worker/*.worker.unit.test.ts`)
- **Integration**: optional with test DB for critical jobs (`__tests__/integration/worker/`)
- **Concurrency / exactly-once**: cross-cutting race suite at `src/tests/integration/worker-race/*.integration.test.ts` (processor races, atomic claim races, stale-state reclaim; stripe-webhook, webhook-delivery, mail) — real Postgres; run with `pnpm test:integration` (serial workers — do not colocate DB race tests under `*.unit.test.ts`)
- Do not unit-test BullMQ wiring alone
- **Coverage**: worker processors are included in `pnpm test:coverage` when they live under `src/domains/**/workers/`; prioritize branch coverage on organization scoping and retry/DLQ paths over line coverage on queue registration boilerplate

---

## Domain integration test steps

1. Read the routes file — endpoints, middleware, access control.
2. `beforeAll`: `createTestApp()`; `afterAll`: `await app.close()`.
3. `beforeEach`: `cleanupDatabase()`; seed permissions if needed.
4. Per route: 401, 403 (if gated), 200 (204 for DELETE), 400 validation.
5. Run targeted `pnpm test:*`. `pnpm dev` can keep running: local test runs use their own database (`<project>_test`, created and migrated by the global setup — see `src/tests/helpers/local-test-database.ts`), never the one `pnpm dev` serves. A remote `DATABASE_*URL` in your env files is replaced (main and migration logins) or dropped (operator and maintenance logins), every wipe checks `current_database()` first, and Redis cleanup only ever touches the `<product>:test:` namespace. Provider keys are fakes forced by `src/tests/helpers/harness-provider-env.ts`, which also makes nock refuse every HTTP(S) and `fetch` connection to a non-loopback host — no suite can reach the real Stripe, Resend or S3, even by accident. Stub the client module in a suite that needs a provider call (a call that slips through fails at once with nock's `NetConnectNotAllowedError`).

---

## Vitest projects

All tiers share one root **`vitest.config.ts`**. Named projects live in **`tooling/vitest/projects.ts`**. Scripts filter with **`--project <name>`** (for example `default`, `unit`, `e2e`, `contract`, `chaos`). Default **`pnpm test`** runs the **`default`** project only (excludes contract, chaos, and smoke).

### Selecting the affected tests

`pnpm test:select` names the test files a change can affect (`--why` says why each was picked,
`--run` runs them lane by lane). The rules live in `tooling/vitest/test-selection.util.ts`:

| Rule | Selects |
| --- | --- |
| Next to the code | every test under the folder that owns the changed file's tests (the nearest folder above it with `__tests__/`) |
| Imports | a test whose imports reach the changed file — not through the test harness (`src/tests/helpers/`) or a wiring file (outside every app sub-domain, importing three or more areas: `app.container.ts`, `worker-containers.ts`) |
| Domain map | a test that boots the app (reaches `src/app.ts`), by its area: the changed file's (`app/<sub-domain>`, or `<domain>`) and every area whose code imports it; plus app tests that name a reached sub-domain (`/app/leads`) |
| Containers | a test that loads a container wiring file (`app-records.container.ts`, `worker-containers.ts`), directly or through the harness, for any change the container wires: it fails as soon as anything it wires fails to load. Found by the 18 Oct planted-break proof (a top-level throw in the leads service failed 41 unit test files of other sub-domains the selection had skipped); only containers, because following every wiring file would select about half the unit suite |
| Mentions | a test that names the changed path, its file name, a folder above it (also as `join('agent-os', 'hooks')`) or a glob over it |
| Always run | on any source change under `src/`: the security project (RLS, the permission matrix), `src/tests/e2e/`, the global scans, every test that imports nothing from the repository, and every **unreachable** test — one a change it depends on would not select: an app-booting test outside every domain (the API contract and OpenAPI response suites, the cross-cutting integration and performance suites), or one that reaches non-escalating code only through the harness or a wiring file (62 today) |

Everything runs when a change touches the escalation list (dependencies, Vitest config and
`tooling/vitest/`, the test harness, tenancy, user, auth, audit, `src/shared/`, `src/core/`,
`src/infrastructure/`, `migrations/`, the app entry files), a path outside the known roots, a
deleted file nothing imports any more, or when the selector fails. So an app sub-domain change
gets a small selection and a core-domain change runs everything — by design.

PR CI uses the selection as an **early signal**: the `Affected database tests (early signal)` job
runs `pnpm test:select --changed-only --exclude 'src/tests/security/rls/**' --lane db-bound --run`
beside the database matrix. `--changed-only` keeps only the tests picked for the change — the
always-run set is the matrix's — and selects nothing when the change selects everything, so a
core-domain change skips it. For an app sub-domain change it is a fraction of the matrix (a
`leads` service change: 13 database files, about 3 minutes locally), so a red result arrives
first. It is not a gate: the matrix still decides the merge.

The selection is checked against the full suite: when a PR's unit job or database matrix fails,
the `Selector miss check` job (`pnpm test:selector-misses`, not a gate) lists every failed file the
selection would have skipped — a miss, or a flake. A real miss becomes an entry in
`tooling/vitest/selector-fixtures.json` (its fixture line is printed), so the next selection
includes it. `pnpm agent-os:check` holds the selection to those entries and to one generated
fixture per sub-domain and nested sub-domain (its main file selects every test in its folder),
checks that the core domains run everything and that every unreachable test is always run
(`tooling/vitest/selector-fixtures.check.ts`).

### Selected tests at push

`.husky/pre-push` runs its unit tests through `pnpm test:pre-push`
(`tooling/vitest/pre-push-tests.ts`). By default that is `pnpm test:unit`, the whole unit
project. With `PRE_PUSH_SELECTED_TESTS=1` it runs only the unit-project files the selection picks
for the pushed commits, always-run files included. A core-domain change (tenancy, user, auth,
audit, `src/shared/`, `src/core/`, `src/infrastructure/`) escalates, so it still runs the whole
project, as does a selection that cannot be built. Measured on 18 Oct: a `leads` service change selects 93
of the 718 unit files (621 tests), which run in 62 s against 518 s for the whole project.

The switch stays off by default until the `Selector miss check` has reported no miss for two
weeks. Then the default flips to on, in `pre-push-tests.ts`. `pnpm test:affected` previews either
way.

### Run one database suite at a time

`fileParallelism: false` on the database-backed projects (`unit-db`, `e2e`, `integration`,
`security`, `performance`, `smoke`) serialises files **within** a run — it says nothing about two
runs. Start a second one against the same Postgres and each will `TRUNCATE ... RESTART IDENTITY`
between the other's fixture inserts.

The result does not look like what it is. You get a foreign-key violation (SQLSTATE 23503) inside
some unrelated suite, which reads as a regression in the code under test, plus a wall clock several
times the usual one. It has cost more than one debugging round.

`src/tests/global-setup.ts` now claims a lock keyed on `DATABASE_URL`, so the second run **fails
immediately** with the holder's pid and command instead of producing a confusing result. A crashed
run's lock is taken over automatically (dead pid), and two runs against two different databases do
not block each other. If a suite refuses to start and the named process is genuinely gone, delete
the lock file the message points at.

### Parallel database tests (experiment)

`pnpm test:parallel-db` runs the e2e and integration suites with files in parallel — the
`db-parallel` project, which exists only with `TEST_PARALLEL_DATABASES=true`
(`tooling/vitest/parallel-databases.ts`). After migrating and seeding, global setup clones the test
database once per worker with `CREATE DATABASE … TEMPLATE` (`<test database>_worker_<n>`; roles
are cluster-wide, so every login works in a clone), and each worker points its `DATABASE_*URL`s at
its clone and its Redis prefix at `<stem>:worker-<n>:test:` (`src/tests/helpers/local-test-database.ts`).
The wipe guard accepts exactly those clones, and only in such a run; a hosted test database is
refused. `TEST_PARALLEL_WORKERS` sets the count (1–16, default 4).

On the billing suites (23 files, 132 tests) it took 148 s against 338 s serial, both green, on a
shared machine. **Serial stays the default** until the main canary's `Parallel database tests
(experiment)` job (nightly, not a gate, no failure issue; its summary records the time) has 10
green runs; then the database lanes switch to it.

### What global setup prepares

Before any database-backed suite, `src/tests/global-setup.ts` mirrors the deploy sequence
(`pnpm db:migrate` → `pnpm db:seed`, see `reusable-railway-deploy.yml`): it takes the lock above,
runs `pnpm db:migrate`, and then seeds the **permission catalog** (`tenancy.permissions`) with the
reference seeder. The catalog is reference data, not a migration, so without that step it existed
only after some suite happened to call `seedAllPermissions()` — and every login that provisions a
personal organization depended on test order. `cleanupDatabase()` truncates everything **except**
`permissions` and `schema_migrations`, so the catalog seeded once stays in place for the whole run.
A suite that empties the catalog on purpose must restore it (`seedAllPermissions()` in `afterEach`).

---

## Coverage reports

| Rule       | Detail                                       |
| ---------- | -------------------------------------------- |
| Output     | Repo root `coverage/` (gitignored)           |
| Created by | `pnpm test:coverage` only                    |
| Browse     | open `coverage/lcov-report/index.html`       |
| Thresholds | Stage 5 in `vitest.config.ts`; see AGENTS.md |

---

## Templates

### Domain route integration (`fastify.inject`)

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp } from "@/tests/helpers/test-app.js";
import { injectAuthenticated } from "@/tests/helpers/test-http-inject.helper.js";
import { cleanupDatabase } from "@/tests/helpers/test-database.js";
import type { FastifyInstance } from "fastify";

describe("<Domain> — integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it("returns 401 without auth", async () => {
    const response = await injectAuthenticated(app, {
      method: "GET",
      url: "/api/v1/...",
      token: "", // or omit auth per helper API
    });
    expect(response.statusCode).toBe(401);
  });
});
```

### Validator unit

```typescript
import { describe, expect, it } from "vitest";
import { ValidationError } from "@/shared/errors/index.js";
import { validateExample } from "@/domains/<domain>/sub-domains/<resource>/<resource>.validator.js";

describe("example.validator", () => {
  it("accepts valid input", () => {
    expect(validateExample({/* valid */})).toMatchObject({/* expected */});
  });

  it("throws ValidationError for invalid input", () => {
    expect(() => validateExample({})).toThrow(ValidationError);
  });
});
```

---

## Anti-patterns

- Domain route tests in `src/tests/` (belong under `src/domains/.../__tests__/integration/`)
- `*.test.ts` directly under `__tests__/` (use `integration/` or `unit/`)
- Validator unit tests in `src/tests/unit/` for domain validators
- Two domains in one `__tests__/` folder
- Unit-testing services with real database or Redis
- Pointing a local test run at the database `pnpm dev` serves (e.g. `ALLOW_HOSTED_TEST_DATABASE=true` with your dev URL) — every suite truncates all tables with `RESTART IDENTITY`
- Vitest files under `src/tests/load/` (k6-only)
- Expecting `coverage/` after `pnpm test` (use `pnpm test:coverage`)

---

## Related

- [SETUP.md](../../../SETUP.md) § 4 Testing → **Running a live server for a frontend / loopback E2E suite** — the `.env.development` env a real `pnpm dev` server needs when an external suite (e.g. clinozy-fe Playwright) hits it over loopback (`RATE_LIMIT_RELAXED_CAPS`, `DATABASE_TLS_ENFORCED`, `DATABASE_RLS_SAFETY_ENFORCED`, organization-mode flags). In-process Vitest tiers and CI self-configure and need none of it.
- [sub-domains-layout.md](../architecture/sub-domains-layout.md) — test placement vs with/without routes
- [api-testing.md](../../getting-started/api-testing.md) — manual smoke checklist
- [documentation-system.md](../architecture/documentation-system.md) — layered docs ownership map
- `src/tests/<suite>/<suite>.overview.md` — per-suite scope (unit, integration, e2e, global, chaos, contract, performance, security, smoke, load, bench)
- `.cursor/skills/be-test-generator/SKILL.md` — orchestration checklist
