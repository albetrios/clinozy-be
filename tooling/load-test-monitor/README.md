# Load Testing Monitoring

A recording reverse proxy on **:4985** with a live dashboard, for reading what a load run actually
did. Point k6 at it instead of the API and every call is captured and grouped per route as it lands.

```bash
pnpm load:monitor                     # proxy + dashboard on 127.0.0.1:4985 — open the URL it prints
BASE_URL=http://127.0.0.1:4985 VUS=50 k6 run src/tests/load/k6/scenarios/fe-login-to-organization.js
```

## What it is for

k6 prints its summary only once the run has finished, and only the numbers it was asked to collect.
This shows the run **while it happens** — which route is being hit, what came back, and where the
time is going — and it keeps the full request and response of every call, so a failure can be read
rather than guessed at. That is the difference between "19 calls failed" and "19 calls returned 503
from the overload guard".

## What it is NOT

Not application monitoring, and not a second copy of one. Production signals come from `/metrics`
(Prometheus), Sentry, and Bull Board at `/admin/queues`, and the Grafana definitions live in
`tooling/dev/dashboards/`. This tool holds everything in memory and disappears when you stop it.
**Loopback development only** — never put it in front of a deployed API.

## Access and what it keeps

- **Loopback only.** It listens on `127.0.0.1`; no other machine can reach it.
- **Session token.** The dashboard URL it prints carries a per-boot random token. Every
  `/__monitor/*` endpoint requires it (`?token=` or `x-session-token`), plus a loopback `Host` and,
  from a browser, a loopback `Origin` — the DB Viewer's guard, shared in
  [`tooling/dev/loopback-guard.mjs`](../dev/loopback-guard.mjs). Two paths need no token: the proxy
  itself (point k6 at it) and the run announcement a scenario `POST`s to `/__monitor/run` (k6 sends
  no `Origin`; a cross-origin browser page does and is refused).
- **Redacted recordings.** Bodies, query strings and headers are redacted before they are stored
  ([`lib/recording-redaction.mjs`](lib/recording-redaction.mjs)), with the application's own
  `redactSensitive` — the redactor behind the logs and Sentry. A proxied login is kept as
  `{"email":"[REDACTED]","password":"[REDACTED]"}`; `X-Api-Key` and similar headers become
  `[redacted]`; `Authorization` keeps only a fingerprint (first 12 and last 8 characters) to
  correlate a virtual user's calls; a body that cannot be parsed for redaction is withheld.

The name carries the qualifier for a reason. "Load **Testing** Monitoring" is monitoring *of a load
test* — it exists for the minutes a run takes and then goes away. An unqualified "api-monitor", which
this was once called, reads as monitoring *of the API*, a job the list above already covers.

## Endpoints

| Endpoint | Purpose |
| -------- | ------- |
| `/` | Dashboard — per-route calls, ok/error/429 counts, avg, p95, max, total time (open with the printed `?token=` URL) |
| `/__monitor/stream` | Server-sent events feed of calls as they land (token) |
| `/__monitor/stats` | Per-route aggregates as JSON (token) |
| `/__monitor/calls` | Recorded calls (`?limit=`) with redacted headers and bodies (token) |
| `/__monitor/clear` | `POST` — reset counters between runs (token) |
| `/__monitor/run` | `POST` — a scenario announces its shape (VUs, routes, pool) so the board can show the command that produced the numbers (no token); `GET` reads it (token) |
| everything else | proxied to the upstream API |

## Configuration

**Port 4985 is fixed and not configurable.** It sits beside the DB viewer's 4984 so the loopback dev
tools occupy one obvious band, and it is deliberately not read from the environment: a bare `PORT`
is the API server's own variable (env schema, default 3000), so a shell exporting it for the API
would silently move this proxy too.

| Env | Default | Purpose |
| --- | ------- | ------- |
| `LOAD_MONITOR_UPSTREAM` | `http://localhost:3000` | The API to forward to |

## Reading the numbers

The proxy sits in the request path, so it adds latency and a second event loop on the same box.
Compare monitor-to-monitor, never monitor-to-direct. Before quoting any before/after, read
[Trusting a result](../../docs/reference/testing/load-testing.md#trusting-a-result) — run-to-run
variance on a co-located box has been measured at 2.07x.

Runs under `tsx` (`pnpm load:monitor`) so the recorder can reuse the application's TypeScript
redactor; otherwise Node built-ins only.
