#!/usr/bin/env bash
# The logic of the ci-failure-issue action (action.yml): MODE=open|close, TITLE, BODY,
# CLOSE_COMMENT, WORKFLOW_URL, GH_REPOSITORY, and GH_TOKEN for `gh`.
set -euo pipefail

existing_issue() {
  gh issue list --repo "${GH_REPOSITORY}" --state open --label ci-failure \
    --search "in:title \"${TITLE}\"" --json number --jq '.[0].number // empty'
}

case "${MODE}" in
  open)
    gh label create ci-failure --repo "${GH_REPOSITORY}" \
      --color FFAB91 --description "Automated post-merge/guard failure notification" \
      2>/dev/null || true
    issue_body="$(printf 'Run: %s\n\n%s' "${WORKFLOW_URL}" "${BODY}")"
    existing="$(existing_issue)"
    if [ -n "${existing}" ]; then
      gh issue comment "${existing}" --repo "${GH_REPOSITORY}" --body "${issue_body}"
      echo "Commented on existing ci-failure issue #${existing}."
    else
      gh issue create --repo "${GH_REPOSITORY}" --title "${TITLE}" --label ci-failure --body "${issue_body}"
    fi
    ;;
  close)
    existing="$(existing_issue)"
    if [ -z "${existing}" ]; then
      echo "No open ci-failure issue to close."
      exit 0
    fi
    gh issue close "${existing}" --repo "${GH_REPOSITORY}" --comment "${CLOSE_COMMENT} Run: ${WORKFLOW_URL}"
    echo "Closed ci-failure issue #${existing}."
    ;;
  *)
    echo "ci-failure-issue: mode must be open or close, got '${MODE}'" >&2
    exit 2
    ;;
esac
