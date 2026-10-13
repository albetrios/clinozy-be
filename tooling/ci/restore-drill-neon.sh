#!/usr/bin/env bash
# Neon PITR branch helpers for the monthly restore drill workflow.
# Requires: MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY (an organization or personal Neon API key),
#           RESTORE_DRILL_ENVIRONMENT (the GitHub Environment, e.g. production), jq, curl.
# Every Neon name derives from PROJECT_SLUG (setup manifest) and the environment — the infrastructure
# repository's rule, one Neon project per environment:
#   project   <slug>-<environment>                e.g. clinozy-be-production
#   branch    <environment>                       the project's only branch, the drill's parent
#   database  <slug_with_underscores>_<environment>
#   owner     <database>_owner                    the role the drill branch's URL logs in as

set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"
# Read only PROJECT_SLUG: the file is not shell-safe to `source` (PROJECT_DISPLAY_NAME holds an
# unquoted space, which bash runs as a command — exit 127 under `set -e`). The emptiness check uses
# no colon so the identity generator's slug rewrite matches only the fallback default further down.
if [ -z "${PROJECT_SLUG-}" ] && [ -f "${REPOSITORY_ROOT}/.github/project-identity.env" ]; then
  PROJECT_SLUG="$(sed -n 's/^PROJECT_SLUG=//p' "${REPOSITORY_ROOT}/.github/project-identity.env" | head -n 1)"
fi

NEON_API_BASE="${NEON_API_BASE:-https://console.neon.tech/api/v2}"
RESTORE_DRILL_ENVIRONMENT="${RESTORE_DRILL_ENVIRONMENT:?RESTORE_DRILL_ENVIRONMENT is required (the GitHub Environment, e.g. production)}"
NEON_PROJECT_NAME="${RESTORE_DRILL_NEON_PROJECT_NAME:-${PROJECT_SLUG:-clinozy-be}-${RESTORE_DRILL_ENVIRONMENT}}"
NEON_PARENT_BRANCH_NAME="${RESTORE_DRILL_ENVIRONMENT}"
NEON_DATABASE_NAME="${NEON_PROJECT_NAME//-/_}"
NEON_OWNER_ROLE_NAME="${NEON_DATABASE_NAME}_owner"
PITR_LOOKBACK_MINUTES="${PITR_LOOKBACK_MINUTES:-15}"
BRANCH_TTL_HOURS="${BRANCH_TTL_HOURS:-2}"
OPERATION_POLL_INTERVAL_SECONDS="${OPERATION_POLL_INTERVAL_SECONDS:-2}"
OPERATION_POLL_TIMEOUT_SECONDS="${OPERATION_POLL_TIMEOUT_SECONDS:-300}"

_CACHED_NEON_PROJECT_ID=""

neon_api_key() {
  printf '%s' "${MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY:?MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY is required}"
}

neon_project_id() {
  if [ -n "$_CACHED_NEON_PROJECT_ID" ]; then
    printf '%s' "$_CACHED_NEON_PROJECT_ID"
    return 0
  fi

  local projects_json project_id
  projects_json="$(neon_list_projects)"
  project_id="$(printf '%s' "$projects_json" | jq -r --arg name "$NEON_PROJECT_NAME" '.projects[]? | select(.name == $name) | .id' | head -n 1)"
  if [ -z "$project_id" ] || [ "$project_id" = "null" ]; then
    echo "::error::Could not find the Neon project ${NEON_PROJECT_NAME} (one project per GitHub Environment) via the Neon API. Check API key access." >&2
    exit 1
  fi

  _CACHED_NEON_PROJECT_ID="$project_id"
  printf '%s' "$project_id"
}

# Lists the key's projects. An organization API key carries its organization; a personal key must
# name it (`org_id`), so on Neon's "org_id is required" this looks up the key's organizations and,
# when there is exactly one, asks again for that organization's projects.
neon_list_projects() {
  local response_file status organizations_json organization_count
  response_file="$(mktemp)"
  status="$(neon_send GET "/projects" "" "$response_file")"
  if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
    cat "$response_file"
    rm -f "$response_file"
    return 0
  fi
  if ! grep -q 'org_id is required' "$response_file"; then
    echo "::error::Neon API GET /projects failed with HTTP ${status}: $(cat "$response_file")" >&2
    rm -f "$response_file"
    exit 1
  fi
  rm -f "$response_file"

  organizations_json="$(neon_request GET "/users/me/organizations")"
  organization_count="$(printf '%s' "$organizations_json" | jq '.organizations | length')"
  if [ "$organization_count" -ne 1 ]; then
    echo "::error::The Neon API key belongs to ${organization_count} organizations — use an organization API key so the drill knows which one." >&2
    exit 1
  fi
  neon_request GET "/projects?org_id=$(printf '%s' "$organizations_json" | jq -r '.organizations[0].id')"
}

# Sends one Neon API request: prints the HTTP status, leaves the response body in the given file.
neon_send() {
  local method="$1"
  local path="$2"
  local body="$3"
  local response_file="$4"
  local curl_arguments=(
    -sS -o "$response_file" -w '%{http_code}' -X "$method" "${NEON_API_BASE}${path}"
    -H "Authorization: Bearer $(neon_api_key)"
    -H "Accept: application/json"
  )
  if [ -n "$body" ]; then
    curl_arguments+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${curl_arguments[@]}"
}

# Prints the response body of a successful request; fails the step (error on stderr, so a caller's
# command substitution cannot swallow it) otherwise.
neon_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(neon_send "$method" "$path" "$body" "$response_file")"
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "::error::Neon API ${method} ${path} failed with HTTP ${status}: $(cat "$response_file")" >&2
    rm -f "$response_file"
    exit 1
  fi
  cat "$response_file"
  rm -f "$response_file"
}

wait_for_neon_operations() {
  local project_id
  project_id="$(neon_project_id)"
  local deadline=$(( $(date +%s) + OPERATION_POLL_TIMEOUT_SECONDS ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local operations_json
    operations_json="$(neon_request GET "/projects/${project_id}/operations")"
    local pending_count
    pending_count="$(printf '%s' "$operations_json" | jq '[.operations[]? | select(.status != "finished" and .status != "failed" and .status != "error" and .status != "skipped")] | length')"
    if [ "$pending_count" -eq 0 ]; then
      return 0
    fi
    sleep "$OPERATION_POLL_INTERVAL_SECONDS"
  done
  echo "::error::Timed out waiting for Neon operations on project ${project_id}"
  exit 1
}

resolve_parent_branch_id() {
  local project_id
  project_id="$(neon_project_id)"
  local branches_json
  branches_json="$(neon_request GET "/projects/${project_id}/branches")"
  local parent_branch_id
  parent_branch_id="$(printf '%s' "$branches_json" | jq -r --arg name "$NEON_PARENT_BRANCH_NAME" '.branches[]? | select(.name == $name) | .id' | head -n 1)"
  if [ -z "$parent_branch_id" ]; then
    echo "::error::Could not resolve the Neon branch ${NEON_PARENT_BRANCH_NAME} in project ${NEON_PROJECT_NAME} — each environment's project has one branch named after the environment" >&2
    exit 1
  fi
  printf '%s' "$parent_branch_id"
}

create_restore_drill_branch() {
  : "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

  local project_id restore_start_epoch parent_timestamp expires_at parent_branch_id parent_branch_name branch_name create_body create_json
  project_id="$(neon_project_id)"
  # Cache in this shell: neon_project_id runs in command substitutions, whose cache writes are lost.
  _CACHED_NEON_PROJECT_ID="$project_id"
  parent_branch_name="${NEON_PARENT_BRANCH_NAME}"
  restore_start_epoch="$(date +%s)"
  parent_timestamp="$(date -u -d "${PITR_LOOKBACK_MINUTES} minutes ago" +%Y-%m-%dT%H:%M:%SZ)"
  expires_at="$(date -u -d "+${BRANCH_TTL_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)"
  parent_branch_id="$(resolve_parent_branch_id)"
  branch_name="restore-drill-${GITHUB_RUN_ID:-local}"

  create_body="$(jq -n \
    --arg name "$branch_name" \
    --arg parent_id "$parent_branch_id" \
    --arg parent_timestamp "$parent_timestamp" \
    --arg expires_at "$expires_at" \
    '{
      branch: {
        name: $name,
        parent_id: $parent_id,
        parent_timestamp: $parent_timestamp,
        expires_at: $expires_at
      },
      endpoints: [{ type: "read_write" }]
    }')"

  echo "Creating Neon restore drill branch ${branch_name} from parent ${parent_branch_name} at ${parent_timestamp}"
  create_json="$(neon_request POST "/projects/${project_id}/branches" "$create_body")"
  wait_for_neon_operations

  local branch_id database_url
  branch_id="$(printf '%s' "$create_json" | jq -r '.branch.id')"
  # Ask for the project's own database and owner by name — never Neon's default database and role.
  # DIRECT host (pooled=false): the drill runs `pnpm db:migrate` on this URL, and migrate.ts refuses a
  # pooler (its advisory lock needs a session pinned to one backend).
  database_url="$(neon_request GET "/projects/${project_id}/connection_uri?branch_id=${branch_id}&database_name=${NEON_DATABASE_NAME}&role_name=${NEON_OWNER_ROLE_NAME}&pooled=false" | jq -r '.uri')"
  if [ -z "$database_url" ] || [ "$database_url" = "null" ]; then
    echo "::error::Neon did not return a connection URI for branch ${branch_id}"
    exit 1
  fi

  {
    echo "database_url=${database_url}"
    echo "branch_id=${branch_id}"
    echo "restore_start_epoch=${restore_start_epoch}"
    echo "restore_source=neon_pitr_branch"
    echo "parent_branch_name=${parent_branch_name}"
    echo "parent_timestamp=${parent_timestamp}"
  } >> "$GITHUB_OUTPUT"
}

delete_restore_drill_branch() {
  if [ -z "${DRILL_BRANCH_ID:-}" ]; then
    echo "No DRILL_BRANCH_ID set; skipping Neon branch cleanup."
    return 0
  fi
  local project_id
  project_id="$(neon_project_id)"
  echo "Deleting Neon restore drill branch ${DRILL_BRANCH_ID}"
  # Subshell: neon_request `exit`s on failure, which would otherwise end the script before `||` runs.
  # The branch also carries an expires_at TTL, so a failed delete is a warning, not a failed drill.
  (neon_request DELETE "/projects/${project_id}/branches/${DRILL_BRANCH_ID}" >/dev/null) ||
    echo "::warning::Could not delete Neon restore drill branch ${DRILL_BRANCH_ID}; its ${BRANCH_TTL_HOURS}h expiry removes it."
}

case "${1:-}" in
  create) create_restore_drill_branch ;;
  delete) delete_restore_drill_branch ;;
  *)
    echo "Usage: $0 create|delete" >&2
    exit 1
    ;;
esac
