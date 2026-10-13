`src/tests/load/`

# Load / SLO tests

## Purpose

k6-based load tests that exercise the platform at production-like RPS and assert against published SLOs (latency p95 / p99, error rate, throughput). Run on a schedule in CI (`scheduled-k6-load-slo.yml`) and locally on demand.

What this suite covers:

- Per-route SLO compliance (latency + error rate).
- Sustained-load behavior (no memory growth, no connection-pool waiter accumulation).
- Burst behavior (rate limiter, idempotency cache eviction).

What it does **not** cover: function-level latency (see `performance/`), failure-mode behavior (see `chaos/`).

## How to run

One script per scenario (`package.json` → `load:*`), each running a file under `k6/scenarios/`:

```bash
pnpm load:health                  # health probe SLO
pnpm load:auth                    # sign-in flow (needs the full seed with DEMO_PASSWORD)
pnpm load:journey                 # comprehensive journey: sets up every prerequisite, then runs k6
```

`BASE_URL` points k6 at the API (default `http://localhost:3000`).

## Fixtures and helpers

- Scenarios under `k6/scenarios/` define RPS / VU / duration patterns and their thresholds.
- `k6/helpers/` holds the shared helpers (config — base URL, thresholds and the `reason` a role or
  membership delete carries — auth bootstrap, data generators, idempotency keys, the credential pool).

## Dependencies

- **k6** binary — installed locally or in CI.
- **Live API** at `BASE_URL`, seeded for the scenarios that sign in.

## Failure modes

- **SLO breach** → a scenario threshold fails and k6 exits non-zero, so the CI job fails; the k6
  summary shows the per-check and per-threshold breakdown.
- **k6 crash mid-run** → re-run with smaller concurrency; common cause is the test machine running out of file descriptors.

## Related docs

- [docs/reference/testing/load-testing.md](docs/reference/testing/load-testing.md)
