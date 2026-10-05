---
name: be-chaos-test-maintainer
description: Maintains Toxiproxy chaos tests under src/tests/chaos/. Use when adding fault-injection scenarios or changing chaos CI/provision scripts.
trigger: src/tests/chaos/**
triggerNote: Toxiproxy fault-injection suite
indexNote: Toxiproxy fault-injection tests under src/tests/chaos
---

# Chaos test maintainer (clinozy-be)

Keeps **Toxiproxy** fault-injection tests and provision scripts aligned. See `docs/reference/reliability/chaos-testing.md`.

## When to use

- Added/changed `src/tests/chaos/**/*.chaos.test.ts`
- Changed `tooling/vitest/chaos.config.ts`, `pnpm chaos:provision`, or `docker-compose.yml` chaos profile
- CI job **CI / Chaos** fails

## Local workflow

```bash
docker compose up -d postgres redis   # Docker daemon must be running (docker info)
pnpm chaos:up                         # builds tooling/chaos/toxiproxy.Dockerfile on first run
pnpm chaos:provision                  # default upstreams postgres:5432 / redis:6379 (compose net)
pnpm test:chaos                        # self-contained: migrates <local database>_test, forces NODE_ENV=development, sets proxied URLs itself
```

Proxied defaults: Postgres `25432`, Redis `26379`, Toxiproxy admin `8474`.

## First-run gotchas (read before debugging a "broken" suite)

Most chaos "failures" on a fresh machine are environment, not code. Check these first:

- **Toxiproxy image is built locally, not pulled.** `docker-compose.yml` builds
  [`tooling/chaos/toxiproxy.Dockerfile`](../../../tooling/chaos/toxiproxy.Dockerfile) from the official
  GitHub release binary because `ghcr.io/shopify/toxiproxy`'s blob CDN (`pkg-containers.githubusercontent.com`)
  is 403-blocked on some networks. Don't "fix" `chaos:up` by switching to `image: ghcr.io/...` or Docker Hub
  `shopify/toxiproxy` (Docker Hub only has ≤2.1.4, whose `/version` is a bare string and breaks the health
  check). Keep the pinned version matching the CI service container in `reusable-chaos-toxiproxy.yml`.
- **The suite must run as `NODE_ENV=development` with the test-affordance flags set.**
  `src/tests/chaos/bootstrap-env.ts` hard-forces `NODE_ENV = 'development'` (`=`, not `||=`) so a developer's
  `.env.local` cannot leak a different value through `load-env-files`, hard-disables captcha
  (`CAPTCHA_PROVIDER = 'disabled'`, as `src/tests/setup.ts` does — an env file that enables Turnstile otherwise
  fails every public auth form with 401 `errors:captchaRequired`), hard-sets its own Redis key prefix
  (`REDIS_KEY_PREFIX = '<product>:test:'` — with `??=` an env file's prefix won and the chaos jobs and
  `cleanupTestRedis` ran inside the dev namespace), and sets the explicit flags the suite needs
  (`TEST_MODE` — the single gate for `cleanupDatabase`/`cleanupTestRedis`; `RATE_LIMIT_IN_MEMORY_FALLBACK_ALLOWED`).
  Provider keys come from the shared `src/tests/helpers/harness-provider-env.ts` (forced fakes, no
  telemetry), the same module `src/tests/setup.ts` loads — never add provider keys to the bootstrap.
  The chaos global setup takes the same database suite lock as the main suite: both truncate this
  machine's one `<local database>_test`, so they cannot run at once.
  NODE_ENV is `local` | `development` | `production`; never downgrade the hard-forces to `||=`.
- **Provision upstreams are in-network defaults.** With Toxiproxy in the compose network, `chaos:provision`
  uses `postgres:5432` / `redis:6379`. Only set `CHAOS_TOXIPROXY_POSTGRES_UPSTREAM` / `..._REDIS_UPSTREAM`
  (e.g. `127.0.0.1:5432`) if you run Toxiproxy outside the compose network.
- **Idempotency replay tests must resend the *same* body.** The middleware fingerprint is method+route+**body**;
  a different payload under the same `X-Idempotency-Key` is a correct **422** (`idempotency_key_reuse`), not a replay.
- **Teardown that disables a proxy must bound `app.close()`.** Administratively disabling the Postgres proxy can
  leave a severed `postgres.js` connection that `sql.end()` cannot drain, hanging `afterAll` to its timeout.
  Re-enable the proxy, probe once, then `Promise.race` the close against a short cap (see `postgres-health.chaos.test.ts`).

## Adding a scenario

1. Create `src/tests/chaos/<name>.chaos.test.ts` (picked up only by `tooling/vitest/chaos.config.ts`).
2. Use existing helpers for toxic injection and cleanup.
3. Assert **graceful degradation** (no unhandled rejections; correct HTTP/status/cache behavior).
4. Document non-obvious setup in `docs/reference/reliability/chaos-testing.md` if needed.

## CI

`reusable-chaos-toxiproxy.yml`: provision → migrate (proxied `DATABASE_URL`) → `pnpm test:chaos`.

## Checklist

- [ ] Scenario cleans up toxics after test (and bounds `app.close()` if it disables a proxy)
- [ ] Does not rely on RLS session context in workers (pass organization identifiers explicitly)
- [ ] `pnpm test:chaos` passes locally with chaos profile up
- [ ] No changes to default `pnpm test` unless intentional
- [ ] `bootstrap-env.ts` still hard-forces `NODE_ENV = 'development'`, `CAPTCHA_PROVIDER = 'disabled'`, `REDIS_KEY_PREFIX` + the test-affordance flags (never `||=` / `??=`)
- [ ] Toxiproxy still built locally from `tooling/chaos/toxiproxy.Dockerfile`, version matching the CI service container

## Related skills

- **be-workers-events** — queue/worker behavior under faults
- **be-production-hardening-guard** — circuit breakers, readiness
- **be-ci-investigation** — chaos job failures

---

**Related skills:** [be-contract-test-maintainer](../be-contract-test-maintainer/SKILL.md) · [be-test-generator](../be-test-generator/SKILL.md)
