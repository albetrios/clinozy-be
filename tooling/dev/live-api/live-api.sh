#!/usr/bin/env bash
# TEMPORARY — the launch iteration's curl checks (user rule 2026-10-08: development is checked
# with curl until every ROUTE row is green; the test phase then writes the real suites and this
# folder goes). Source it, never run it:
#
#   source tooling/dev/live-api/live-api.sh
#   as_role owner                         # TOKEN = the owner's, in the fixture organization
#   api GET /app/offerings                # prints "<status> <compact body>"
#   last '.data[0].id'                    # reads the last response body with jq
#   expect 409 "duplicate name" POST /app/offering-groups '{"name":"Laser"}'
#
# Talks to the live stack (`pnpm dev:stack:status`) and the fixture `pnpm dev:fixture` writes;
# needs curl, jq and Docker Compose (the Postgres container, for `compose_sql`).

LIVE_API_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LIVE_API_BASE="${LIVE_API_BASE:-http://127.0.0.1:${PORT:-3000}/api/v1}"
LIVE_API_DIR="${AGENT_STACK_DIR:-/tmp/agent-stack}/live-api"
LIVE_API_FIXTURE="${LIVE_API_DIR}/fixture.json"
# The demo login's password — the same env var and default `pnpm db:seed:demo-admin` uses.
LIVE_API_PASSWORD="${DEMO_PASSWORD:-DemoPassword123!}"
mkdir -p "${LIVE_API_DIR}"

# api METHOD PATH [JSON] — one request as $TOKEN; a POST carries a fresh X-Idempotency-Key
# (unless NO_IDEMPOTENCY_KEY=1) and $ACCEPT_LANGUAGE is sent when set. Prints
# "<status> <compact body>" and keeps the body for `last`.
api() {
  local method=$1 path=$2 body=${3:-} status
  local arguments=(-sS -o "${LIVE_API_DIR}/last.json" -w '%{http_code}' -X "${method}" "${LIVE_API_BASE}${path}")
  [ -n "${TOKEN:-}" ] && arguments+=(-H "Authorization: Bearer ${TOKEN}")
  if [ "${method}" = POST ] && [ -z "${NO_IDEMPOTENCY_KEY:-}" ]; then
    arguments+=(-H "X-Idempotency-Key: $(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')")
  fi
  [ -n "${ACCEPT_LANGUAGE:-}" ] && arguments+=(-H "Accept-Language: ${ACCEPT_LANGUAGE}")
  [ -n "${body}" ] && arguments+=(-H 'Content-Type: application/json' --data "${body}")
  status="$(curl "${arguments[@]}")"
  echo "${status} $(jq -c . "${LIVE_API_DIR}/last.json" 2>/dev/null || cat "${LIVE_API_DIR}/last.json")"
}

# last JQ — the last response body through jq (raw output).
last() { jq -r "$1" "${LIVE_API_DIR}/last.json"; }

# fixture JQ — a value of the fixture `pnpm dev:fixture` wrote.
fixture() { jq -r "$1" "${LIVE_API_FIXTURE}"; }

# compose_sql — runs the SQL on stdin in the local Compose database (as its superuser).
compose_sql() {
  # shellcheck disable=SC2016 # expanded by the container's shell, from its own environment
  docker compose -f "${LIVE_API_ROOT}/docker-compose.yml" exec -T postgres \
    sh -c 'psql -v ON_ERROR_STOP=1 -q -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

# login_token EMAIL — an access token for the login (no organization picked yet).
login_token() {
  curl -sS -X POST "${LIVE_API_BASE}/auth/login" -H 'Content-Type: application/json' \
    -H 'X-Captcha-Bypass: true' \
    --data "$(jq -nc --arg email "$1" --arg password "${LIVE_API_PASSWORD}" '{email: $email, password: $password}')" \
    | jq -r '.data.access_token // empty'
}

# token_expiry TOKEN — the JWT's `exp` (seconds), read from its payload.
token_expiry() {
  printf '%s' "$1" | jq -R 'split(".")[1] | gsub("-";"+") | gsub("_";"/") | @base64d | fromjson | .exp' 2>/dev/null || echo 0
}

# as_role ROLE — TOKEN becomes ROLE's (owner, admin, doctor, therapist, front_desk, counsellor,
# pharmacist, accountant, marketing) in the fixture organization; cached until a minute before it
# expires, so a check file logs each person in once.
as_role() {
  local role=$1 cache="${LIVE_API_DIR}/token-$1" email organization_id
  if [ -s "${cache}" ] && [ "$(token_expiry "$(cat "${cache}")")" -gt "$(( $(date +%s) + 60 ))" ]; then
    TOKEN="$(cat "${cache}")"
    return 0
  fi
  email="$(fixture ".members.${role}.email // empty")"
  organization_id="$(fixture '.organization_id')"
  [ -n "${email}" ] || { echo "as_role: no ${role} in ${LIVE_API_FIXTURE} — run pnpm dev:fixture" >&2; return 1; }
  TOKEN="$(login_token "${email}")"
  [ -n "${TOKEN}" ] || { echo "as_role: ${email} could not log in" >&2; return 1; }
  api POST /auth/switch-to-organization "$(jq -nc --arg id "${organization_id}" '{organization_id: $id}')" >/dev/null
  TOKEN="$(last '.data.access_token // empty')"
  [ -n "${TOKEN}" ] || { echo "as_role: ${email} could not switch to ${organization_id}" >&2; return 1; }
  printf '%s' "${TOKEN}" > "${cache}"
}

# ---- checks -----------------------------------------------------------------------------------
LIVE_API_RESULTS="${LIVE_API_RESULTS:-${LIVE_API_DIR}/results.tsv}"

# record PASS|FAIL LABEL [DETAIL] — one result line for the runner's table.
record() {
  printf '%s\t%s\t%s\t%s\n' "$1" "${LIVE_API_CHECK_FILE:-adhoc}" "$2" "${3:-}" >> "${LIVE_API_RESULTS}"
  [ "$1" = PASS ] || echo "  FAIL  $2  ${3:-}" >&2
}

# expect STATUS LABEL METHOD PATH [JSON] — the request must answer STATUS.
expect() {
  local want=$1 label=$2 got
  shift 2
  got="$(api "$@")"
  if [ "${got%% *}" = "${want}" ]; then
    record PASS "${label}"
  else
    record FAIL "${label}" "want ${want}, got ${got:0:240}"
  fi
}

# expect_value LABEL JQ WANT — the last response's JQ value must print WANT.
expect_value() {
  local label=$1 got
  got="$(last "$2" 2>/dev/null)"
  if [ "${got}" = "$3" ]; then
    record PASS "${label}"
  else
    record FAIL "${label}" "want '$3', got '${got:0:240}'"
  fi
}

# calendar_day OFFSET — the fixture organization's today plus OFFSET days, as YYYY-MM-DD.
calendar_day() {
  node -e 'const [offset, timeZone] = process.argv.slice(1);
console.log(new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(Date.now() + Number(offset) * 864e5)));' \
    -- "$1" "$(fixture '.timezone')"
}

# expect_equal LABEL GOT WANT — two computed values must match (a paged list's names).
expect_equal() {
  if [ "$2" = "$3" ]; then record PASS "$1"; else record FAIL "$1" "want '$3', got '${2:0:240}'"; fi
}
