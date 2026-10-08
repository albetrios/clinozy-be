#!/usr/bin/env bash
# TEMPORARY — `pnpm dev:fixture`: a fresh organization on the live stack for the launch
# iteration's curl checks (see live-api.sh; removed with it once the test phase writes the suites).
#
# Builds, every run anew (a stamped slug, so runs never collide):
#   1. the demo admin (`pnpm db:seed:demo-admin`) as the Owner of a new TEAM organization;
#   2. seats raised to 20 on every plan (the demo plans allow 1) — in the local Compose database;
#   3. two branches, Vesu and Adajan;
#   4. one live member per preset role, working at Vesu — invited through the API, then made
#      live in the database (the demo password, a verified email, `active`, joined now).
# Writes $AGENT_STACK_DIR/live-api/fixture.json (default /tmp/agent-stack): the organization,
# branches, roles and members — `as_role <role>` logs any of them in.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
# shellcheck source=tooling/dev/live-api/live-api.sh
source tooling/dev/live-api/live-api.sh

die() { echo "dev:fixture: $*" >&2; exit 1; }
# need STATUS LABEL METHOD PATH [JSON] — the call must answer STATUS, else stop.
need() {
  local want=$1 label=$2 got
  shift 2
  got="$(api "$@")"
  [ "${got%% *}" = "${want}" ] || die "${label}: want ${want}, got ${got:0:300}"
}

curl -s -o /dev/null -m 3 "${LIVE_API_BASE%/api/v1}/livez" || die "the API is not up — pnpm dev:stack:status"
pnpm --silent db:seed:demo-admin >/dev/null 2>&1 || pnpm db:seed:demo-admin >/dev/null || die "db:seed:demo-admin failed"

stamp="$(date +%s)"
owner_email="${DEMO_EMAIL:-demo@example.com}"
rm -f "${LIVE_API_DIR}"/token-*

TOKEN="$(login_token "${owner_email}")"
[ -n "${TOKEN}" ] || die "the demo admin cannot log in"
need 200 "create the organization" POST /tenancy/organizations \
  "{\"name\":\"Fixture clinic ${stamp}\",\"slug\":\"fixture-${stamp}\"}"
organization_id="$(last '.data.id')"
timezone="$(last '.data.timezone')"
need 200 "switch to it" POST /auth/switch-to-organization "{\"organization_id\":\"${organization_id}\"}"
TOKEN="$(last '.data.access_token')"
printf '%s' "${TOKEN}" > "${LIVE_API_DIR}/token-owner"

echo "UPDATE billing.plans SET included_seats = GREATEST(included_seats, 20);" | compose_sql >/dev/null

branch_body() {
  jq -nc --arg name "$1" --arg email "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]').${stamp}@fixture.example" \
    '{name: $name, address_line_one: "12 Ring Road", area: $name, city: "Surat", postal_code: "395007", phone: "+919876543210", email: $email}'
}
need 200 "create branch Vesu" POST /app/branches "$(branch_body Vesu)"
vesu="$(last '.data.id')"
need 200 "create branch Adajan" POST /app/branches "$(branch_body Adajan)"
adajan="$(last '.data.id')"

need 200 "list roles" GET /tenancy/organization/roles
roles_json="$(last '[.data[] | {key: (.name | ascii_downcase | gsub(" "; "_")), value: .id}] | from_entries')"

members_json="$(jq -nc --arg email "${owner_email}" '{owner: {email: $email, role: "Owner"}}')"
for role in Admin Doctor Therapist "Front desk" Counsellor Pharmacist Accountant Marketing; do
  key="$(printf '%s' "${role}" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')"
  email="${key//_/-}.${stamp}@fixture.example"
  role_id="$(printf '%s' "${roles_json}" | jq -r --arg key "${key}" '.[$key]')"
  need 200 "add the ${role}" POST /tenancy/organization/memberships \
    "$(jq -nc --arg email "${email}" --arg role "${role_id}" --arg branch "${vesu}" '{email: $email, role_ids: [$role], branch_ids: [$branch]}')"
  members_json="$(printf '%s' "${members_json}" | jq -c --arg key "${key}" --arg email "${email}" \
    --arg role "${role}" --arg membership "$(last '.data.id')" '. + {($key): {email: $email, role: $role, membership_id: $membership}}')"
done

compose_sql >/dev/null <<SQL
UPDATE auth.users
   SET password_hash = (SELECT password_hash FROM auth.users WHERE email = '${owner_email}'),
       is_email_verified = true
 WHERE email LIKE '%.${stamp}@fixture.example';
UPDATE tenancy.memberships AS membership
   SET status = 'active', joined_at = now()
  FROM auth.users AS login
 WHERE login.id = membership.user_id AND login.email LIKE '%.${stamp}@fixture.example';
SQL

jq -n --arg organization_id "${organization_id}" --arg slug "fixture-${stamp}" --arg timezone "${timezone}" \
  --arg vesu "${vesu}" --arg adajan "${adajan}" --argjson roles "${roles_json}" --argjson members "${members_json}" \
  '{organization_id: $organization_id, slug: $slug, timezone: $timezone,
    branches: {vesu: $vesu, adajan: $adajan}, roles: $roles, members: $members}' > "${LIVE_API_FIXTURE}"

echo "dev:fixture: ${organization_id} (fixture-${stamp}, ${timezone}) — branches Vesu ${vesu}, Adajan ${adajan}"
echo "dev:fixture: members $(jq -r '.members | keys | join(", ")' "${LIVE_API_FIXTURE}") — as_role <member> after: source tooling/dev/live-api/live-api.sh"
echo "dev:fixture: written to ${LIVE_API_FIXTURE}"
