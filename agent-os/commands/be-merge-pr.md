---
description: Merge a PR once CI is green and approvals are in
argument-hint: <pr-number>
allowed-tools: Bash(git*), Bash(gh pr merge*)
---

Merge PR **$ARGUMENTS** on green, through GitHub's own auto-merge:

1. Confirm there is no merge conflict. The branch need not be up to date with `main` — the `main`
   ruleset does not require it (`strict` is off).
2. Turn on auto-merge with squash: `gh pr merge --auto --squash <pr>`, or the GitHub MCP
   `enable_pr_auto_merge` (merge method `SQUASH`); keep the conventional title. GitHub then merges
   the moment every required check passes and the required approvals are in — it waits on its own,
   so there is nothing to poll.
3. Report that auto-merge is on, and the merge when the PR event arrives (/be-watch-pr).

Never merge around a red or pending required check: no `--admin`, no merge API call that skips a
gate. A check that stays red is fixed or re-run, never bypassed.
