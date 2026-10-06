#!/usr/bin/env bash
#
# One-shot front-load of EVERY prerequisite for the comprehensive journey load test.
# Captures all the settings/fixes discovered the hard way (see COMPREHENSIVE-JOURNEY.md), so a run
# never stalls mid-flight to change a setting. Idempotent; safe to re-run.
#
#   bash src/tests/load/k6/setup-loadtest.sh [VUS] [WORKERS]
#       VUS     (default 100)  sizes the credential-pool seed
#       WORKERS (default 10)   sizes the cluster + DB pool (N×pool ≤ Postgres max − 10)
#
# Then:   node src/tests/load/k6/check-prereqs.mjs   (auto-run at the end)
#         VUS=<n> DURATION=60s k6 run src/tests/load/k6/scenarios/comprehensive-journey.js
#
# Teardown:  bash src/tests/load/k6/setup-loadtest.sh --teardown
#
# Your env files are never edited: the load-test settings live in data/loadtest-overrides.env
# (gitignored, no secrets) and reach only the processes started here, as their environment.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

K6_DATA=src/tests/load/k6/data
OVERRIDES="$K6_DATA/loadtest-overrides.env"
SERVER_LOG="$K6_DATA/loadtest-server.log"

# Run a command with the load-test settings. NODE_ENV=local makes the machine-local env file the
# PRIMARY file, which the loader applies without overriding the process environment — so these
# settings win over it without anyone rewriting it.
with_load_test_env() {
  (
    set -a
    # shellcheck source=/dev/null
    . "$OVERRIDES"
    set +a
    NODE_ENV=local exec "$@"
  )
}

if [ "${1:-}" = "--teardown" ]; then
  echo "Teardown: stop cluster + drop the load-test overrides"
  pkill -f cluster-run.mjs 2>/dev/null || true
  rm -f "$OVERRIDES"
  echo "Done. Postgres stays at max_connections=500 (harmless for dev); DB seed/pool are reusable."
  exit 0
fi

VUS="${1:-100}"
WORKERS="${2:-10}"
# Connection budget the server asserts at boot: (API replicas + worker replicas) × DATABASE_POOL_MAX
# ≤ POSTGRES_MAX(500) − POSTGRES_RESERVED(10) = 490. The 1 worker process counts, hence WORKERS + 1.
POOL=$(( 490 / (WORKERS + 1) )); [ "$POOL" -gt 100 ] && POOL=100
NEEDED=$(( VUS * 14 / 10 ))   # +40% headroom (~20% of users are MFA-blocked + margin)

echo "==> Load-test setup: VUS=$VUS, WORKERS=$WORKERS, DB pool=$POOL"

# Box headroom. A load number measures the MACHINE as much as the API: orphaned dev servers left by
# earlier sessions (`pnpm dev` whose parent is pid 1, each with a `tsx watch` child) and a box deep
# in swap have inflated p99 ~5x before — and one such watcher hijacked :3001 on 2026-09-24. Warn,
# don't fail: the run is still valid for "this box right now", just not for "this API".
echo "[0/7] preflight: box headroom"
ORPHANED_DEV_SERVERS=$(ps -A -o ppid=,pid=,command= | awk '$1 == 1 && /pnpm dev|tsx\/dist\/cli\.mjs watch/ {printf "%s ", $2}')
if [ -n "$ORPHANED_DEV_SERVERS" ]; then
  echo "      ⚠ orphaned dev servers (parent pid 1): ${ORPHANED_DEV_SERVERS}— stop them for clean numbers:"
  echo "        pkill -f '[t]sx/dist/cli.mjs watch'; kill ${ORPHANED_DEV_SERVERS}"
fi
SWAP_USED_MB=$(sysctl -n vm.swapusage 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "used") {value = $(i + 2); sub(/M$/, "", value); print int(value)}}')
if [ "${SWAP_USED_MB:-0}" -gt 4096 ]; then
  echo "      ⚠ ${SWAP_USED_MB} MB of swap in use — latency will partly measure paging, not the API"
fi
[ -z "$ORPHANED_DEV_SERVERS" ] && [ "${SWAP_USED_MB:-0}" -le 4096 ] && echo "      no orphaned dev servers; swap ${SWAP_USED_MB:-0} MB"

echo "[1/7] write the load-test overrides ($OVERRIDES)"
mkdir -p "$K6_DATA"
cat > "$OVERRIDES" <<EOF
# Written by setup-loadtest.sh — load-test settings for the cluster it starts. No secrets.
# Per-route rate caps -> 5000/min.
RATE_LIMIT_RELAXED_CAPS=true
CAPTCHA_PROVIDER=disabled
# The local Docker Postgres/Redis are plaintext and there is no reverse proxy.
DATABASE_TLS_ENFORCED=false
DATABASE_RLS_SAFETY_ENFORCED=false
REDIS_TLS_ENFORCED=false
TRUST_PROXY_REQUIRED=false
PORT=3001
# The global limiter never rejects the one k6 source IP, while still running so its cost is
# measured: the schema caps RATE_LIMIT_MAX at 100000, and a 1 s window makes that 100k req/s.
RATE_LIMIT_MAX=100000
RATE_LIMIT_WINDOW_MS=1000
# create-webhook host passes the SSRF allowlist.
WEBHOOK_URL_ALLOWLIST=example.com
# Empty = unset (the env loader drops blank values): no Sentry during a run.
SENTRY_DSN=
# Role create/delete under concurrency.
MEMBER_ROLE_MAX_PER_ORG=500
# The connection-budget check reads these.
POSTGRES_MAX_CONNECTIONS=500
DATABASE_POOL_MAX=$POOL
DEPLOYMENT_API_REPLICA_COUNT=$WORKERS
DEPLOYMENT_WORKER_REPLICA_COUNT=1
EOF

echo "[2/7] ensure Docker stack + Postgres max_connections=500 + Redis host port-forward"
SONAR=0 docker compose up -d postgres redis >/dev/null 2>&1 || true
postgres_ready() { docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; }
postgres_max_connections() { docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "show max_connections"' 2>/dev/null | tr -d ' '; }
for _ in $(seq 1 30); do postgres_ready && break; sleep 0.5; done
MC=$(postgres_max_connections)
if [ "${MC:-0}" -lt 500 ]; then
  echo "      max_connections=$MC < 500 -> recreating Postgres (data persists)"
  docker compose up -d --force-recreate postgres >/dev/null 2>&1
  for _ in $(seq 1 30); do postgres_ready && break; sleep 0.5; done
fi
echo "      Postgres max_connections=$(postgres_max_connections)"
# Redis: verify the HOST port-forward, not just the container. OrbStack/Docker Desktop can leave
# the forward half-open (TCP accepted then dropped -> ioredis "Connection is closed" -> the server
# fails to boot) while an in-container ping still PONGs. Restart the container to re-bind it.
REDISURL=$(grep -E '^REDIS_URL=' .env.local | head -1 | sed 's#.*REDIS_URL=##' | tr -d '"')
redis_host_ok() { REDIS_URL="${REDISURL:-redis://localhost:6379}" node -e 'const R=require("ioredis");const c=new R(process.env.REDIS_URL,{maxRetriesPerRequest:1,retryStrategy:()=>null,reconnectOnError:()=>false});const t=setTimeout(()=>process.exit(1),2500);c.ping().then(()=>{clearTimeout(t);process.exit(0)}).catch(()=>{clearTimeout(t);process.exit(1)})' >/dev/null 2>&1; }
if ! redis_host_ok; then
  echo "      Redis host port-forward half-open -> restarting container"
  docker compose restart redis >/dev/null 2>&1
  for _ in $(seq 1 20); do redis_host_ok && break; sleep 0.5; done
fi
echo "      Redis host port-forward: $(redis_host_ok && echo OK || echo FAILED)"

echo "[3/7] build + copy runtime assets to dist (tsc skips .lua/.json/.sql/.html — they're read at runtime)"
pnpm build >/dev/null
rsync -a --include='*/' --include='*.lua' --include='*.html' --include='*.json' --include='*.sql' --exclude='*' src/ dist/src/

echo "[4/7] credential pool (need ~$NEEDED users for $VUS VU after MFA-blocked)"
POOL_FILE="$K6_DATA/credential-pool.json"
HAVE=$(node -e "try{console.log(require('./$POOL_FILE').length)}catch{console.log(0)}")
if [ "${HAVE:-0}" -lt "$NEEDED" ]; then
  ORGS=$(( (NEEDED + 11) / 12 ))
  echo "      have $HAVE < $NEEDED -> seeding $ORGS organizations x 12 users"
  # The bulk seeder refuses a non-local DATABASE_URL — never override that here.
  BULK_PROFILE=demo BULK_ORGS="$ORGS" BULK_USERS_PER_ORG=12 pnpm db:seed:bulk >/dev/null 2>&1
  pnpm tool:load-test-credential-pool >/dev/null 2>&1
fi
echo "      pool: $(node -e "console.log(require('./$POOL_FILE').length)") users"

echo "[5/7] reset leaked journey rows + this namespace's rate-limit counters (local database only)"
with_load_test_env pnpm --silent load:reset

echo "[6/7] start cluster ($WORKERS workers on :3001)"
pkill -f cluster-run.mjs 2>/dev/null || true; sleep 1
# Anything else on :3001 answers /livez too — a stale `pnpm dev` started with PORT=3001 did exactly
# that — and every later check, and the k6 run, would then measure the wrong server while
# reporting green.
if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "      ✗ :3001 is already in use (pid $(lsof -nP -t -iTCP:3001 -sTCP:LISTEN | head -1)) — stop it and re-run" >&2
  exit 1
fi
CLUSTER_WORKERS="$WORKERS" with_load_test_env nohup node cluster-run.mjs > "$SERVER_LOG" 2>&1 &
for _ in $(seq 1 60); do
  [ "$(grep -ciE 'Server listening at http://127' "$SERVER_LOG")" -ge "$WORKERS" ] && break
  sleep 0.5
done
LISTENING=$(grep -ciE 'Server listening at http://127' "$SERVER_LOG")
echo "      livez -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/livez) ($LISTENING/$WORKERS workers)"
if [ "$LISTENING" -lt "$WORKERS" ]; then
  echo "      ✗ only $LISTENING of $WORKERS workers are listening — see $SERVER_LOG" >&2
  exit 1
fi

echo "[7/7] verify prerequisites"
VUS="$VUS" with_load_test_env node src/tests/load/k6/check-prereqs.mjs
