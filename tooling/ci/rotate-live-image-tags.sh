#!/usr/bin/env bash
# Rotates the live-image tags after a successful production deploy, for each image given:
#   :previous <- the image that was live until this deploy (the old :current)
#   :current  <- the image just deployed
# rollback-deploy.yml redeploys :previous, so it must be the release BEFORE the live one — tagging
# the just-deployed image as :previous made a rollback redeploy the release being rolled back.
#
# The deployed image is pinned by ID before any tag moves: a rollback deploys :previous itself,
# and that tag is reassigned below. Redeploying the live image leaves :previous alone. The first
# run under this scheme has no :current yet and keeps the existing :previous (which still names
# the image live before this deploy).
#
# Usage: rotate-live-image-tags.sh <deployed-image-ref>...   (the registry login is the caller's)
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <deployed-image-ref>..." >&2
  exit 2
fi

rotate() {
  local deployed="$1"
  local base="${deployed%:*}"
  docker pull --quiet "${deployed}" >/dev/null
  local deployed_id
  deployed_id="$(docker image inspect --format '{{.Id}}' "${deployed}")"

  if docker pull --quiet "${base}:current" >/dev/null 2>&1; then
    local current_id
    current_id="$(docker image inspect --format '{{.Id}}' "${base}:current")"
    if [ "${current_id}" != "${deployed_id}" ]; then
      docker tag "${current_id}" "${base}:previous"
      docker push --quiet "${base}:previous" >/dev/null
      echo "${base}:previous <- the image live before this deploy (${current_id:7:12})"
    else
      echo "${base}: redeployed the live image — :previous unchanged"
    fi
  else
    echo "${base}: no :current yet — :previous left as is"
  fi

  docker tag "${deployed_id}" "${base}:current"
  docker push --quiet "${base}:current" >/dev/null
  echo "${base}:current <- the deployed image (${deployed_id:7:12})"
}

for image in "$@"; do
  rotate "${image}"
done
