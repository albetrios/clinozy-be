# k6 load test scenarios

Load tests for the clinozy-be API. Keep this doc in sync with [docs/reference/testing/load-testing.md](../../../../docs/reference/testing/load-testing.md).

## Prerequisites

- **Server**: `RATE_LIMIT_MAX=10000 pnpm dev` — raises the per-IP limit for load testing; plain `pnpm dev` 429s at high VU counts. The journeys that create webhooks (user-journey, fe-full-surface) also need `WEBHOOK_URL_ALLOWLIST=example.com`.
- **Postgres + Redis**: Required for auth and organization-dependent scenarios (`docker compose up -d` or your own).
- **Database**: `pnpm db:migrate`, `pnpm setup:local --only-env` (turns on the database logins the migrations create), then choose a seed tier:
  - Single-user scenarios (`api-stress`, `daily-ops`, etc.): `pnpm db:seed:full` (demo user `demo@example.com` / `DemoPassword123!`)
  - Per-VU multi-user scenario (`user-journey`): `pnpm db:seed:loadtest` — seeds 12 organizations × 10 users with full domain data and writes `src/tests/load/k6/data/credential-pool.json` (gitignored; contains passwords)
- **k6**: [Install k6](https://k6.io/docs/get-started/installation/).

## Organization scoping (flat routes)

Org-scoped routes are flat — they carry **no** `/organizations/{organization_id}` path segment and **no** organization id header. The active organization rides the access token's signed `org` claim.

- To run an organization-scoped scenario, `TEST_TOKEN` must be scoped to `TEST_ORG_ID`: either mint it already-scoped, or the scenario calls `switchToOrganization(token, TEST_ORG_ID)` for you (the tenancy/billing/permission/idempotency scenarios do this in-flow).
- `helpers/auth.js` exposes the scoping helpers: `switchToOrganization(token, organizationPublicId)`, `switchToPersonal(token)`, and `loginScopedToOrganization(email, password, organizationPublicId)` (login + switch in one call). `authHeaders(token)` returns `Authorization` + `Content-Type` only — no organization header.

## Quick runs (no auth)

- `pnpm load:health` — health endpoints
- `pnpm load:stress` — health under stress (up to 100 VUs)
- `pnpm load:breakpoint` — capacity test: ramps arrival rate (10 → 300 req/s) until SLOs break (finds max throughput)
- `pnpm test:bench` — Autocannon on `/readyz`

**Scoped stress checks:** Run `pnpm load:stress` (health) and `pnpm load:stress:api` (API with TEST_TOKEN + TEST_ORG_ID). See [docs/reference/testing/load-testing.md](../../../../docs/reference/testing/load-testing.md#scoped-load-coverage).

**Read breadth:** `pnpm load:read-surface` exercises 23 nondestructive GET routes with a TEAM-scoped `TEST_TOKEN` / `TEST_ORG_ID`. See the [coverage and intent rules](../../../../docs/reference/testing/load-testing.md#route-coverage-and-test-intent); scenario presence is not proof of execution.

**Nightly CI:** [.github/workflows/scheduled-k6-load-slo.yml](../../../../.github/workflows/scheduled-k6-load-slo.yml) (`Scheduled k6 API load & SLO`) — gate on `load:stress`-equivalent and `load:stress:api`-equivalent k6 runs; see [docs/reference/testing/load-testing.md](../../../../docs/reference/testing/load-testing.md#nightly-ci-gate-github-actions).

**Interpreting results:** Running k6 on the **same host** as the API caps throughput and inflates latency through CPU contention — treat single-box numbers as lower bounds and regression signals, not true capacity. See [docs/reference/testing/load-testing.md](../../../../docs/reference/testing/load-testing.md#interpreting-results-co-located-load-generation).

## Scenarios

| Scenario        | File                           | Required env                                             | Command / script                                  |
| --------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- |
| Health          | `scenarios/health.js`          | (optional `BASE_URL`)                                    | `pnpm load:health`                                |
| Health stress   | `scenarios/health-stress.js`   | (optional `BASE_URL`)                                    | `pnpm load:stress`                                |
| Health breakpoint | `scenarios/health-breakpoint.js` | (optional `BASE_URL`)                                | `pnpm load:breakpoint`                            |
| API stress      | `scenarios/api-stress.js`      | `TEST_TOKEN`, `TEST_ORG_ID`                              | `pnpm load:stress:api`                            |
| Auth onboarding | `scenarios/auth-onboarding.js` | `DEMO_EMAIL`, `DEMO_PASSWORD` (required)          | `pnpm load:auth`                                  |
| Passwordless signup | `scenarios/passwordless-signup.js` | API started with `TEST_MODE=true` (echoes the code); no creds — unique user per run | `pnpm load:signup`                |
| Daily ops       | `scenarios/daily-ops.js`       | `TEST_TOKEN`, `TEST_ORG_ID`                              | `pnpm load:daily-ops`                             |
| Billing         | `scenarios/billing.js`         | `TEST_TOKEN`, `TEST_ORG_ID` (optional for authed routes) | `pnpm load:billing`                               |
| Webhooks        | `scenarios/webhooks.js`        | `TEST_TOKEN`, `TEST_ORG_ID`                              | `pnpm load:webhooks`                              |
| RLS concurrency | `scenarios/rls-concurrency-beyond-pool.js` | `TEST_TOKEN`, `TEST_ORG_ID` (optional `DATABASE_POOL_MAX`, `BEYOND_POOL_FACTOR`, `BEYOND_POOL_VUS`) | `pnpm load:rls-concurrency`          |
| Admin           | `scenarios/admin.js`           | `ADMIN_TOKEN`                                            | `pnpm load:admin` (after `pnpm tool:admin-token`) |
| **User journey** | `scenarios/user-journey.js`  | credential pool (see below) + API started with `WEBHOOK_URL_ALLOWLIST=example.com` | `pnpm load:user-journey`                          |
| **clinozy-fe journey** | `scenarios/fe-login-to-organization.js` | credential pool + API on `TEST_MODE=true` with `AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED` | `VUS=50 POOL=50 k6 run src/tests/load/k6/scenarios/fe-login-to-organization.js` — the full front-end journey, one pass per VU (VUs are users). Knobs: `VUS`, `POOL`, `AUTH` (`code`\|`password`\|`otp`), `STATIC_CODE`, `STAGGER`, `RESULT_TAG` |
| **Session journey** | `scenarios/session-refresh-journey.js` | `DEMO_EMAIL`, `DEMO_PASSWORD` (required) | `pnpm load:session-journey` — login → Bearer read → cookie+CSRF refresh → rotated-token read → logout → refresh 401 |
| **Comprehensive journey** | `scenarios/comprehensive-journey.js` | none — `setup-loadtest.sh` seeds the pool and starts a cluster on `:3001` with its settings in the gitignored `data/loadtest-overrides.env` (your env files are never edited) | `pnpm load:journey` (setup + run), `pnpm load:journey:down`, `pnpm load:reset` (leaked journey rows + this namespace's rate-limit counters, local database only). See [COMPREHENSIVE-JOURNEY.md](COMPREHENSIVE-JOURNEY.md) |
| Login burst (rate limit) | `scenarios/login-burst-rate-limit.js` | none (dedicated non-existent identity; optional `BURST_EMAIL`) | `pnpm load:login-burst` — brute-force burst must yield only 401/429 and ≥1 429 proves a limiter engaged. Holds locally too: the per-IP failed-login throttle (50 failures / 15 min) is not relaxed by `RATE_LIMIT_RELAXED_CAPS`. Kept OUT of the nightly gate: that throttle then refuses every login from the IP for the rest of its window |

**Obtaining credentials:**

- **TEST_TOKEN + TEST_ORG_ID**: `pnpm tool:load-test-credentials` (server up, full seed) — prints values for copy-paste.
- **ADMIN_TOKEN**: `pnpm tool:admin-token` (server up) — signs in as a `GLOBAL_ADMIN_EMAILS` account and prints its `super_admin` access token (5 minutes by default). Create the account first: `DEMO_EMAIL=<admin email> pnpm db:seed:demo-admin`.
- **Credential pool** (user-journey, fe-login-to-organization): `pnpm db:seed:loadtest` — no server needed; writes `src/tests/load/k6/data/credential-pool.json` automatically. Each VU logs in as a distinct user so tokens are minted once in `setup()` via `helpers/pool.js`.

**Rate limit:** High-concurrency scenarios (`api-stress`, `rls-concurrency`) exceed the default global limit of `RATE_LIMIT_MAX` (100) requests per `RATE_LIMIT_WINDOW_MS` (60s) per IP, so the server returns `429` and k6 marks the requests as failed. Start the API with `RATE_LIMIT_MAX=10000 pnpm dev` (or `pnpm dev:loadtest`) before running them. The nightly CI workflow already boots the API at `RATE_LIMIT_MAX=10000`.

**MFA accounts are excluded from the pool.** The generator filters out `users.is_mfa_enabled` and members of any organization with `security_policy.mfa_required`, mirroring the login gate. Those accounts return HTTP 200 with an `mfa_required` envelope rather than an `access_token`, so a VU drawing one reads no token and silently abandons its journey — quietly understating concurrency instead of failing loudly.

**Before reporting a before/after**, read [Trusting a result](../../../../docs/reference/testing/load-testing.md#trusting-a-result). Run-to-run variance on a co-located box has been measured at 2.07x, so a single-run comparison proves nothing.

Full details (env, how to run each scenario): [docs/reference/testing/load-testing.md](../../../../docs/reference/testing/load-testing.md).

### Strict lifecycle and distinct-user validation

See [the canonical load-testing guide](../../../../docs/reference/testing/load-testing.md#strict-lifecycle-and-distinct-user-validation)
for prerequisites, assertions, cleanup, and limits of the role/API-key lifecycle
and distinct-user tenant pagination scenarios. Configure lifecycle runs with
`DURATION` and `MIN_COMPLETED`; configure distinct-user reads with `VUS`.
The nightly workflow enforces the distinct-user and persisted-lifecycle gates;
failed checks or incomplete journeys fail the job.

The six additional account, MFA, tenant, admin, upload and WebAuthn lifecycle gates use an isolated database and loopback fixtures. See [fixture-backed lifecycle coverage](../../../../docs/reference/testing/load-testing.md#fixture-backed-lifecycle-coverage) for setup, verified behavior and provider limitations.

Stripe key-first testing and the local signed outbound receiver are documented in [Stripe provider and outbound webhook validation](../../../../docs/reference/testing/load-testing.md#stripe-provider-and-outbound-webhook-validation). Run `pnpm test:stripe:load` with an explicit scratch database.
