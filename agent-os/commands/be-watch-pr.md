---
description: Watch a PR — triage CI failures and review comments until it is green
argument-hint: <pr-number>
allowed-tools: Bash(git*), Bash(pnpm*)
---

Watch PR **$ARGUMENTS** and keep it merge-ready:

1. Subscribe to PR activity (`subscribe_pr_activity`) so CI, reviews, and comments wake this session — never poll `gh pr checks`, the API or `sleep`. After a push from the CLI, the `push-ci-watch.mjs` hook wakes the session when a run of the pushed commit fails (it needs an authenticated `gh`).
2. On a red CI event: start **be-ci-investigator** at once, in the background — one agent per failing check, told the PR, the check and its run id — and do not read the logs yourself meanwhile. When it reports, apply its fix plan in scope, push, update the status checklist.
3. On a review comment: if the fix is unambiguous, apply + push; if not, ask via `AskUserQuestion`.
4. On a merge conflict or new push: rebase or resolve, then re-verify.

5. On green with the approvals in: **/be-merge-pr** turns on GitHub auto-merge (once is enough —
   GitHub merges when every required check passes).

Keep going until the PR is MERGED or CLOSED, or the user says stop (then `unsubscribe_pr_activity`). Reply only when something needs the user; otherwise let the PR diff be the record.
