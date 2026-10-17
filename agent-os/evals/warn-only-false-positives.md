# Warn-only false positives

The checks below warn before they block, so their rules are tuned on real changes first. Add a row
when the user says a finding is wrong; never edit a row afterwards.

## Review findings

Findings from the `/be-pre-merge-review` reviewers, before the review starts blocking `/be-ship`
on 2026-10-31 — so the reviewers (`agent-os/agents/`) and `REVIEW.md` can be tuned.

| Date | Reviewer | Finding (`file:line` · check) | Why it is wrong |
| ---- | -------- | ----------------------------- | --------------- |

## Early checks

Findings from the early checks — the RLS policy lint (`pnpm validate:rls-policies`), the route
access diff (`pnpm routes:access-diff`), the lockfile dependency audit at commit, Semgrep at push
(`pnpm security:semgrep:push`) and the live API probe after a deploy (`pnpm ops:probe-live-api`) —
before they block on 2026-10-31
(`src/scripts/tooling/early-checks.util.ts`).

| Date | Check | Finding | Why it is wrong |
| ---- | ----- | ------- | --------------- |
