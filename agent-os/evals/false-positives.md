# False positives

The pre-merge review and the early checks block on a finding. When the user says a finding is
wrong, add a row here and fix the rule; never edit a row afterwards.

## Review findings

Findings from the `/be-pre-merge-review` reviewers — so the reviewers (`agent-os/agents/`) and
`REVIEW.md` get tuned.

| Date | Reviewer | Finding (`file:line` · check) | Why it is wrong |
| ---- | -------- | ----------------------------- | --------------- |

## Early checks

Findings from the early checks — the RLS policy lint (`pnpm validate:rls-policies`), the lockfile
dependency audit at commit, Semgrep at push (`pnpm security:semgrep:push`) and the live API probe
after a deploy (`pnpm ops:probe-live-api`) — `src/scripts/tooling/early-checks.util.ts`.

| Date | Check | Finding | Why it is wrong |
| ---- | ----- | ------- | --------------- |
