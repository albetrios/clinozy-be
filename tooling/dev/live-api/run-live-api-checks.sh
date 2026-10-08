#!/usr/bin/env bash
# TEMPORARY — `pnpm dev:checks [--reuse-fixture] [sub-domain…]`: replays the launch iteration's
# curl checks against the live stack — a fresh fixture (`pnpm dev:fixture`), then each
# sub-domain's `checks/<sub-domain>.checks.sh` in build order — and prints PASS/FAIL per file.
# Re-run after every ROUTE row: a later row's change must not break an earlier sub-domain. Goes
# with the rest of this folder once the test phase writes the suites.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

# Build order (routes-final): each ROUTE row adds its sub-domain's file here.
CHECK_ORDER=(offerings contacts contact-activities leads appointments patients billing stock tasks medical)

reuse_fixture=0
selected=()
for argument in "$@"; do
  case "${argument}" in
    --reuse-fixture) reuse_fixture=1 ;;
    -*) echo "dev:checks: unknown option ${argument} (only --reuse-fixture)" >&2; exit 2 ;;
    *) selected+=("${argument}") ;;
  esac
done
[ "${#selected[@]}" -gt 0 ] || selected=("${CHECK_ORDER[@]}")

# shellcheck source=tooling/dev/live-api/live-api.sh
source tooling/dev/live-api/live-api.sh
if [ "${reuse_fixture}" = 0 ] || [ ! -s "${LIVE_API_FIXTURE}" ]; then
  bash tooling/dev/live-api/live-api-fixture.sh || exit 1
fi
: > "${LIVE_API_RESULTS}"
# A suffix every name a check file creates carries, so a re-run on a reused fixture never collides.
export LIVE_API_RUN="${LIVE_API_RUN:-$(date +%s)}"

for name in "${selected[@]}"; do
  file="tooling/dev/live-api/checks/${name}.checks.sh"
  [ -f "${file}" ] || { echo "dev:checks: no ${file}" >&2; exit 2; }
  echo "▶ ${name}"
  LIVE_API_CHECK_FILE="${name}" bash -c 'source tooling/dev/live-api/live-api.sh && source "$1"' _ "${file}" \
    || record FAIL "${name}: the file stopped early" "exit $?"
done

echo ""
awk -F'\t' '{ count[$2 FS $1]++; files[$2] = 1 }
  END {
    printf "%-14s %6s %6s\n", "sub-domain", "pass", "fail"
    for (file in files) printf "%-14s %6d %6d\n", file, count[file FS "PASS"], count[file FS "FAIL"]
  }' "${LIVE_API_RESULTS}"
failures="$(grep -c '^FAIL' "${LIVE_API_RESULTS}" || true)"
if [ "${failures}" -gt 0 ]; then
  echo ""
  echo "Failed:"
  grep '^FAIL' "${LIVE_API_RESULTS}" | cut -f2- | sed 's/\t/ · /g; s/^/  /'
  exit 1
fi
echo "all checks pass"
