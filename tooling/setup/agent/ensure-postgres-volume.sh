#!/usr/bin/env bash
# Make sure the local Compose Postgres is up and finished its first-time setup — rebuilding a
# volume whose setup was cut short — or exit non-zero.
#
# A cloud session can be paused at any second, and the one step that cannot be resumed is the
# image's first-time setup of an empty volume: initdb, then the rule that lets the host log in,
# then the database. Cut short, it leaves a volume the server starts on but nobody can use —
# depending on the moment, a catalog that cannot be read, no `postgres` database, or no host login
# rule (`no pg_hba.conf entry` at the first migration) — or one it never starts on. `pg_isready`
# passes most of these. Such a volume is rebuilt, but only when it provably holds nothing: no
# database beyond template0, template1 and postgres. Every database anyone creates gets an id of
# 16384 or more and a directory of that name under base/, so the check reads the directories, not
# the catalog, and works on a volume whose catalog is broken. A volume holding any such database
# is never touched, whatever else is wrong with it.
#
#   bash tooling/setup/agent/ensure-postgres-volume.sh     # bootstrap.sh step 5, after compose up
#
# Uses the compose files in COMPOSE_FILE when set (bootstrap.sh sets it for the restricted-Docker
# override), else docker-compose.yml. Prints what it did on stderr; exit 0 when Postgres is
# usable from the host, 1 when it is not.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 1
readonly DATA_DIRECTORY=/var/lib/postgresql/data
# Postgres's FirstNormalObjectId: the lowest id a database created after initdb can have.
readonly FIRST_USER_OBJECT_ID=16384

log() { printf 'ensure-postgres-volume: %s\n' "$*" >&2; }

wait_until_ready() { bash tooling/dev/wait-for-local-postgres.sh >&2; }

container_id() { docker compose ps -a -q postgres 2>/dev/null | head -n 1; }

# The named volume mounted at the data directory of container $1.
volume_of() {
  docker inspect \
    --format "{{range .Mounts}}{{if eq .Destination \"${DATA_DIRECTORY}\"}}{{.Name}}{{end}}{{end}}" \
    "$1" 2>/dev/null
}

# One value from the server's catalog, over the container's own socket (trusted locally), from
# template1; empty when the catalog cannot be read.
catalog_value() {
  docker compose exec -T postgres sh -c 'psql -X -q -U "$POSTGRES_USER" -d template1 -Atc "$1"' \
    sh "$1" 2>/dev/null | tr -d '\r'
}

host_rule_present() {
  docker compose exec -T postgres sh -c \
    'grep -Eq "^host[[:space:]]+all[[:space:]]+all[[:space:]]+all[[:space:]]" "$PGDATA/pg_hba.conf"' \
    >/dev/null 2>&1
}

# How many databases anyone created on volume $1 (directories under base/ with an id of
# FIRST_USER_OBJECT_ID or more), read through a throwaway container of image $2, so it works
# whether the server runs or not. Prints nothing when the volume cannot be read.
user_database_count() {
  local listing entry count=0
  listing="$(docker run --rm -v "$1:/data:ro" --entrypoint sh "$2" \
    -c 'ls -1 /data/base 2>/dev/null; echo listed' 2>/dev/null)" || return 0
  case "${listing}" in *listed) ;; *) return 0 ;; esac
  for entry in ${listing}; do
    case "${entry}" in
      '' | *[!0-9]*) ;;
      *) [ "${entry}" -ge "${FIRST_USER_OBJECT_ID}" ] && count=$((count + 1)) ;;
    esac
  done
  echo "${count}"
}

rebuild() {
  log "rebuilding ${volume}: ${1}; it holds no database of its own."
  docker compose rm -s -f postgres >&2 || return 1
  docker volume rm "${volume}" >&2 || return 1
  docker compose up -d postgres >&2 || return 1
  log "a fresh volume — Postgres runs its first-time setup now (a few seconds)."
  wait_until_ready
}

container="$(container_id)"
if [ -z "${container}" ]; then
  log "no postgres container — start it first (pnpm compose:up)."
  exit 1
fi
volume="$(volume_of "${container}")"
image="$(docker inspect --format '{{.Config.Image}}' "${container}" 2>/dev/null)"

# What is wrong, if anything: empty when the server answers with a finished setup.
problem=""
if ! wait_until_ready; then
  problem="the server never became ready"
else
  default_database="$(catalog_value "select count(*) from pg_database where datname = 'postgres'")"
  if [ -z "${default_database}" ]; then
    problem="the server answers but its catalog cannot be read"
  else
    [ "${default_database}" = 0 ] && problem="no postgres database"
    host_rule_present || problem="${problem:+${problem}, }no host login rule in pg_hba.conf"
  fi
fi

if [ -z "${problem}" ]; then
  log "Postgres is ready (first-time setup complete)."
  exit 0
fi
if [ -z "${volume}" ] || [ -z "${image}" ]; then
  log "Postgres is not usable (${problem}), and its volume cannot be found — leaving it."
  exit 1
fi
user_databases="$(user_database_count "${volume}" "${image}")"
if [ -z "${user_databases}" ]; then
  log "Postgres is not usable (${problem}), and ${volume} cannot be read — leaving it."
  exit 1
fi
if [ "${user_databases}" != 0 ]; then
  log "Postgres is not usable (${problem}), but ${volume} holds ${user_databases} database(s) — not touching it."
  log "repair by hand: docker compose rm -s -f postgres && docker volume rm ${volume} && pnpm compose:up"
  exit 1
fi
if rebuild "first-time setup cut short (${problem})"; then
  log "Postgres is ready."
  exit 0
fi
log "the rebuild failed."
exit 1
