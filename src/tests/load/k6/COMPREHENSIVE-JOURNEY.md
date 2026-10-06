# Comprehensive journey load test — setup, prerequisites & capacity findings

Reference for [`scenarios/comprehensive-journey.js`](scenarios/comprehensive-journey.js): a full,
natural multi-tenant user journey (reads + complete CRUD across every domain) used to measure API
capacity. This file documents **everything needed to reproduce a clean run**, the **prerequisites**
(checked by [`check-prereqs.mjs`](check-prereqs.mjs)), and the **measured capacity ceiling**.

> **Run the whole thing (setup + run) in one command:** `pnpm load:journey`
> (100 VU / 10 workers / 60s; override with `VUS=200 WORKERS=10 DURATION=90s pnpm load:journey`).
> It front-loads every prerequisite, runs the journey, and leaves the rig up for fast re-runs.
> Tear down with `pnpm load:journey:down`.
>
> **Setup only** — applies every prerequisite below and verifies it:
> `bash src/tests/load/k6/setup-loadtest.sh [VUS] [WORKERS]` (defaults `100 10`). It first **warns
> about box headroom** — orphaned dev servers (parent pid 1) and more than 4 GB of swap, either of
> which skews the numbers toward the machine rather than the API — then writes the load-test
> settings to `data/loadtest-overrides.env` (gitignored; **your env files are never edited**),
> **sizes the DB pool to the connection budget**, rebuilds and **copies runtime assets to `dist/`**,
> **heals a half-open Redis port-forward**, ensures Postgres `max_connections=500`, seeds the
> credential pool, resets leaked journey data (`pnpm load:reset`), starts the cluster, and ends by
> running the prereq check. Stop with `bash src/tests/load/k6/setup-loadtest.sh --teardown`.
>
> **Verify-only (run before every k6 run):** `node src/tests/load/k6/check-prereqs.mjs` — checks the
> stack, env, data, and caps below and prints PASS/FAIL with remediation.

All env values here are **load-test-only** — several (captcha off, rate limits disabled, Sentry off)
are intentionally unsafe for production. Never apply them to a hosted environment. Which of these are
auto-rejected at boot in production vs. which the operator must set correctly is documented in
[environment-variables.md §11 — Production safety](../../../../docs/deployment/runbooks/environment-variables.md#11-production-safety-unsafe-dev-and-load-test-values).

---

## TL;DR — what we measured

| Load | Result | Notes |
| ---- | ------ | ----- |
| **1 VU** | p99 ~50–75 ms, 0 fail | per-op idle baseline |
| **100 VU** | **p99 66 ms, 0.00% fail, 752 req/s** ✅ | full comprehensive journey, 10-worker cluster — **verified capacity ceiling on a 12-core dev box** |
| **200 VU** | p99 ~700 ms, ~1.4% fail | **infrastructure-bound**, NOT a server defect (see §7) |

**200 VU is CPU-bound on a single dev box**: k6 (driving 200 VUs) + OrbStack/Docker port-forwarding
for Postgres+Redis (~5.4 cores, proven by a native-Redis swap that dropped OrbStack 544%→6%) + the
worker cluster exceed 12 cores. The cluster has spare capacity; it just can't get cores. To test
200 VU properly: run **k6 off-box** and/or run **Postgres+Redis natively** (no Docker port-forward).

---

## Prerequisites (what `check-prereqs.mjs` verifies)

1. **k6** installed (`k6 version`).
2. **Docker stack up & healthy** — Postgres + Redis (`pnpm compose:up`).
3. **Redis reachable *from the host*** — `redis://localhost:6379` → PONG. OrbStack/Docker can leave the
   port-forward **half-open** (TCP accepted, then dropped) while the container stays healthy, so the
   server fails to boot with ioredis `Connection is closed`. `docker compose exec redis redis-cli ping`
   still PONGs and **won't** catch it — only a host connect does. Fix: `docker compose restart redis`
   (the setup script auto-heals this).
4. **Postgres `max_connections` ≥ 500**.
5. **Postgres connection budget fits** — `(API replicas + worker replicas) × DATABASE_POOL_MAX ≤
   max_connections − reserved(10)`. The server **refuses to boot** if exceeded (see §4).
6. **Credential pool** with enough **usable** users — `data/credential-pool.json`; ~20% are MFA-blocked,
   so seed `≈ VUS / 0.8` (`pnpm db:seed:loadtest`).
7. **Loadtest server reachable** on `:3001` (`/livez` → 200).
8. **Captcha off + login** — a password login returns a token (proves `CAPTCHA_PROVIDER=disabled` + `RATE_LIMIT_RELAXED_CAPS=true`, §1) and an
   organization-scoped read returns 200. The login (like every public auth form the scenarios
   call) sends the dev-only `X-Captcha-Bypass` header (`PUBLIC_AUTH_FORM_HEADERS` in
   `helpers/config.js`), so it also passes against an API that enforces CAPTCHA with
   `CAPTCHA_BYPASS_ALLOWED=true` (`pnpm setup:local --with-captcha`).
9. **Rate limits lifted** — a token works and isn't 429'd.
10. **Role-cap headroom** — `max(roles/organization)` well under `MEMBER_ROLE_MAX_PER_ORG` (data hygiene, §3).

---

## 1. Server config — load-test env overrides (`data/loadtest-overrides.env`)

Run a **dedicated** loadtest server (leave any normal `:3000` dev server alone). `setup-loadtest.sh`
writes these values to `data/loadtest-overrides.env` (gitignored, no secrets) and starts the cluster
with them as its **process environment** under `NODE_ENV=local`. With `NODE_ENV=local` the loader
reads `.env.local` as the primary file, and a primary file never overrides the process environment —
so these values win without anyone editing `.env.local`.

| Env var | Load-test value | Default | Why |
| --- | --- | --- | --- |
| `NODE_ENV` | `local` (command line, never the file) | `local` | makes `.env.local` the primary env file, which does not override the process environment. Nothing branches on it; the full server still runs real auth/DB/RLS. |
| `RATE_LIMIT_RELAXED_CAPS` | `true` | `false` | per-route rate caps bump to 5000. |
| `CAPTCHA_PROVIDER` | `disabled` | `disabled` | public auth forms skip the CAPTCHA check, so the scenarios need no Turnstile token. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `100000` / `1000` | `100` / `60000` | all k6 traffic is one IP; the global limiter must never reject (it still runs — its cost is measured). The schema caps the max at `100000`, so the 1 s window makes it 100k req/s. |
| `WEBHOOK_URL_ALLOWLIST` | `example.com` | `hooks.example.com,*.partner.example.com` | `POST /notify/webhooks` validates host vs allowlist **and** resolves it (SSRF/DNS-pin); `example.com` resolves to a public IP and passes both. |
| `MEMBER_ROLE_MAX_PER_ORG` | `500` (max) | `50` | the journey create/deletes roles under concurrency; the default 50 is hit when many VUs share an organization. |
| `POSTGRES_MAX_CONNECTIONS` | `500` | `100` | the connection-budget check reads this from **env**, not the live DB — must match the actual Postgres `max_connections` (§4). |
| `DATABASE_POOL_MAX` | `44` (10-worker cluster) / `100` (single) | `10` | per-process pool. Budget: `(N_workers + 1) × pool ≤ Postgres max − 10` (§4) — `setup-loadtest.sh` computes it. |
| `DEPLOYMENT_API_REPLICA_COUNT` | `= N_workers` | `2` | makes the budget check account for the cluster. |
| `DEPLOYMENT_WORKER_REPLICA_COUNT` | `1` | `1` | min allowed is 1. |
| `PORT` | `3001` | `3000` | run beside any `:3000` dev server; k6 `BASE_URL` must match. |
| `SENTRY_DSN` | `<empty>` | placeholder | disables Sentry (the loader drops blank values). **Measured impact on latency: ~0 ms** (4.70 vs 4.72 ms). |
| `OVERLOAD_MAX_EVENT_LOOP_DELAY_MS` | `250` (default) | `250` | leave as-is; above this the overload guard sheds 503s (a saturation signal). |

Boot: `setup-loadtest.sh` (or the commands in §4).

## 2. Per-route caps & quotas (which `RATE_LIMIT_RELAXED_CAPS=true` lifts vs not)

`rate-limit-presets.constants.ts` caps bump to **5000/min** under `RATE_LIMIT_RELAXED_CAPS=true`. Prod values:
`STRICT_AUTHED` 10 (`/auth/me/*`), `MODERATE_AUTHED` 30, `ORGANIZATION_SCOPED` 100, `WEBHOOK` 60,
`EXPENSIVE_AUTHED` 5/5min (`data-export`). **Always-on quotas (not rate limits):**

- **Pending-upload quota** (per user): the journey **deletes** the pending upload it creates so it
  never fills. Leak reset: `pnpm load:reset`.
- **`MEMBER_ROLE_MAX_PER_ORG`** (per organization, env, max 500): raise it **and** clean leaked roles (§3).
- **`MAX_TEAM_ORGANIZATIONS_PER_OWNER`** (20): why `create-org` is excluded from the journey (it
  accumulates organizations with no cleanup — organization-delete is destructive).
- **Idempotency** (`X-Idempotency-Key` on `POST /organizations|/memberships|/roles|/api-keys|/notification-policies|/webhooks|/uploads`): reused key
  - different body → 422. Every write gets a fresh key from `idempotencyKey()` (`helpers/idempotency.js`):
  `k6-<label>-<vu>-<iter>-<ms>-<random>` — 16–255 characters, unique across runs without `RUN`.

## 3. Test data

```bash
pnpm db:seed:loadtest   # 12 organizations x 10 users (override BULK_ORGS/BULK_USERS_PER_ORG for more)
# for 200 VU you need >200 usable users; seed ~20x12: 
BULK_PROFILE=demo BULK_ORGS=20 BULK_USERS_PER_ORG=12 pnpm db:seed:bulk && pnpm tool:load-test-credential-pool
```

- **~20% of bulk users are unusable** — their organization has an MFA-required policy, so password login
  returns `mfa_required` (no token). `setup()` filters these out (e.g. 174 of 216 usable).
- **Data hygiene before a run** (leaks from prior runs slow every query → 403/p99 inflation):
  `pnpm load:reset` — setup runs it with the load-test environment. It deletes the journey's leaked
  roles (`Role …`, `Member Role …`) with the memberships assigned to them and every PENDING upload,
  through the operator login (row-level security shows the application role no rows), and only on a
  loopback database. In Redis it clears the rate-limit counters of the load-test namespace only
  (`<product>:local:fastify-rate-limit-*`), never another environment's keys.

## 4. Running

### Single process (≤ ~100 VU, simplest)

A one-worker cluster: the setup sizes the pool for it (`DATABASE_POOL_MAX=100`, one API replica).

```bash
bash src/tests/load/k6/setup-loadtest.sh 100 1
RUN=$(date +%s) VUS=100 DURATION=60s k6 run src/tests/load/k6/scenarios/comprehensive-journey.js
```

### Cluster (lower p99 at higher VU) — [`cluster-run.mjs`](../../../../cluster-run.mjs) (repo root)

Node `cluster` round-robins connections across N workers (one event loop each).
**Connection-budget math** (the server asserts this at boot and **refuses to start** if exceeded):
`(DEPLOYMENT_API_REPLICA_COUNT + DEPLOYMENT_WORKER_REPLICA_COUNT) × DATABASE_POOL_MAX ≤
POSTGRES_MAX_CONNECTIONS − POSTGRES_RESERVED_CONNECTIONS` (reserved default 10) — **the 1 worker
process counts**. For 10 API workers: `DATABASE_POOL_MAX=44` → `(10+1)×44 = 484 ≤ 490`, with
`DEPLOYMENT_API_REPLICA_COUNT=10`, `DEPLOYMENT_WORKER_REPLICA_COUNT=1`. `setup-loadtest.sh` computes the
pool automatically; `check-prereqs.mjs` fails pre-flight if the budget is over.

`setup-loadtest.sh <VUS> <WORKERS>` builds, copies the runtime assets (tsc emits only `.js`) and
starts it. By hand, after a setup has written the overrides:

```bash
pnpm build
rsync -a --include='*/' --include='*.lua' --include='*.json' --include='*.html' --include='*.sql' --exclude='*' src/ dist/src/
# A subshell, so the load-test settings never leak into your shell:
(set -a; . src/tests/load/k6/data/loadtest-overrides.env; set +a; NODE_ENV=local CLUSTER_WORKERS=10 exec node cluster-run.mjs)
RUN=$(date +%s) VUS=100 DURATION=60s k6 run src/tests/load/k6/scenarios/comprehensive-journey.js
```

### Knobs (env)

`VUS`, `DURATION`, `RUN` (names the resources a run creates; a fresh value by default),
`THINK` (think-time s/phase, default 0.4), `WRITE_EVERY` (write phases every Nth iteration; >1 =
read-dominant), `RARE` (`true` to include the cross-organization member-invite flow — OFF by default because
it churns other users' permission caches under load), `DIAG` (`true` logs each failure's status/body),
`BASE_URL`.

## 5. Journey design (why each guard exists)

- **`setup()` mints all tokens once** (login → `switch-to-organization`) and **filters** to
  token-bearing, organization-scoped admins; VUs index in. No per-request login → **can't storm** the per-IP
  login limit. It also issues one **cache-warming** read per user.
- **No re-auth by default** (`REAUTH=false`): re-login on 401 from one IP self-amplifies into a login
  storm under load. (Tokens last 900 s; runs are shorter.)
- **Run-unique names** (`RUN`) and a **fresh idempotency key per write** — no cross-run slug/key
  collisions; a rerun never replays an earlier run's response.
- **Self-cleaning writes** — created roles/keys/policies/webhooks/uploads/memberships are deleted
  in-iteration so data + per-organization caps don't grow.
- **Per-op metrics**: total / `Server-Timing` server-compute / TTFB(waiting) / queue+network, plus
  per-op 4xx/429/503 counters. `handleSummary` prints a table sorted by server-compute and writes
  `/tmp/journey-<vus>vu.json`.

## 6. Interpreting

- **`srvP99`** = pure server compute (`Server-Timing: app;dur`). **`q+net`** = `waitP99 − srvP99` ≈
  queue+network; small at low VU, balloons under saturation.
- **1 VU**: latency is all server-compute (q+net ~1 ms). **At sustained load, requests stay warm**
  (~5 ms reads); the ~22 ms "idle penalty" only hits the first request after a quiet gap (V8 JIT/
  connection warm-up), and vanishes under traffic.
- **`unexpected_failures` (threshold `rate<0.01`)** counts every non-2xx except 429 and 503, so a
  broken write step fails the run instead of passing quietly.
- Failures by type: **429** = a cap not lifted; **503** = overload guard shedding (event-loop > 250 ms);
  **403 `insufficientOrganizationPermissions`** = permission-cache recompute contention (cold/churned
  cache + a slow/loaded DB); **404** = read-after-delete race; **422** = idempotency key reuse.

## 7. Capacity findings (this 12-core dev box, OrbStack/Docker for PG+Redis)

- **100 VU is the clean ceiling**: p99 66 ms, 0 failures, 752 req/s with the 10-worker cluster.
- **200 VU is infrastructure-bound, not server-bound.** At 200 VU the machine hits **99.5% CPU**. The
  dominant consumer is **OrbStack at ~544% (≈5.4 cores)** — pure Docker port-forward overhead for the
  thousands of localhost↔container DB/Redis ops/sec (the containers themselves are <0.3% CPU).
  - **Proof:** moving Redis to a **native** process dropped OrbStack to **6.2%** — confirming the
    port-forward was the cost. (Throughput then fell because Postgres was still Dockerized, moving the
    bottleneck to its port-forward.)
  - **Both Docker modes fail (proven 4 ways):** connecting to the container **VM IPs** (bypassing the
    port-forward proxy, Redis `protected-mode no`) dropped OrbStack 544%→**131%** and left the machine
    **54% idle** — yet throughput **collapsed to 273 req/s** (p99 2.7 s) because direct-IP routing has
    higher per-op latency. So: **port-forward = CPU wall; direct-IP = latency wall.** Either way Docker
    is the binding constraint; the only escape is **native (non-Docker) Postgres+Redis** or **off-box k6**.
  - The worker cluster has spare capacity throughout; it's starved by Docker (CPU) or its latency.
  - **To hit 200 VU idle-p99:** run **k6 on a separate host** and/or run **Postgres + Redis native**
    (no Docker). Both relieve the perm-cache 403s too (faster recompute when not CPU-starved).

## 8. Teardown / revert

`pnpm load:journey:down` (`setup-loadtest.sh --teardown`) stops the cluster and deletes
`data/loadtest-overrides.env`. There is nothing else to revert: setup never edits your env files, and
the settings only ever reached the processes it started. Postgres stays at `max_connections=500`
(the Compose default).

`comprehensive-journey.js`, `cluster-run.mjs`, and this doc are reusable — re-apply §1 + §3 and run
`check-prereqs.mjs` before the next run.
