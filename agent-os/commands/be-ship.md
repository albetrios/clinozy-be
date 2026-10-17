---
description: Ship the current branch — push, open a PR to main, then watch to green
argument-hint: [optional PR title]
allowed-tools: Bash(git*), Bash(pnpm*)
---

Ship the current work as one flow (review → push → PR → watch → merge):

0. **/be-pre-merge-review** — the reviewers the branch's diff needs, at once in the background.
   Warn-only until 2026-10-31: report the findings and continue (a false positive the user names
   goes into `agent-os/evals/review-false-positives.md`). From 2026-10-31, a `critical` or `major`
   finding stops here, before the push, until it is fixed or the user overrides it.
1. **/be-open-pr** — push the branch and open the PR to **main** (title: **$ARGUMENTS** if given).
2. **/be-watch-pr** — subscribe to PR activity; triage CI failures and review comments in a loop.
3. **/be-merge-pr** — turn on GitHub auto-merge (squash) right after the PR opens; GitHub merges it
   when every required check passes and the approvals are in. Stop and report if anything blocks.

Escalate via `AskUserQuestion` only on ambiguous review feedback or an irreversible step. Otherwise drive it to merged unattended.
