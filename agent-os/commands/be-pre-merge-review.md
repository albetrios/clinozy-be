---
description: Run the read-only pre-merge review pipeline and aggregate one report
argument-hint: "[release] — no argument reviews the branch; release reviews everything since the last release tag"
allowed-tools: Bash(git diff*), Bash(pnpm*)
---

Read `REVIEW.md` (repo root) first — it defines the severity ladder, the repo-specific checks in priority order, the skip paths, and the findings format every reviewer in this pipeline uses.

Run the **pre-merge review** pipeline over the diff:

- No argument: the branch — `git diff main...HEAD`, plus uncommitted changes.
- `release`: everything since the last release — `git fetch --tags --quiet origin`, then
  `git diff "$(git describe --tags --abbrev=0 --match 'v*' origin/main)"...HEAD`. No tag yet: say so
  and review the branch instead.

1. Read `agent-os/agents/pipelines.json` → `be-pre-merge-review`. Its `steps` are the reviewers, its `when` says which ones the diff needs: the SQL design, RLS, idempotency and production-hardening reviewers when the diff touches their files, the verifier always.
2. **Start every needed reviewer at once, in the background** — one message with one agent call each, each told the diff range and to return findings in `REVIEW.md` → Findings format. A session capped at fewer parallel agents runs them in batches of that size. Do not read their transcripts while they run; each one's report arrives when it finishes.
3. **Aggregate one report** as `aggregate` says: every finding in the one format, sorted by severity (critical first), the same `file:line` and check from two reviewers merged into one line, anything under `REVIEW.md` → Skip dropped, at most two nits. Then the verifier's verdict and evidence, then each reviewer's `Satisfied` list in one line per check.

Each finding names the procedural skill that fixes it (`handoff`: agent finds, skill fixes). This is review-only: do not edit files.

**Record a clean result.** When the aggregated report has no `critical` or `major` finding and the
verifier passed, run `pnpm agent-os:review-clean --note "<one line>"`: it records the review for
HEAD, and the push review gate (`agent-os/hooks/be-guardrails.mjs`) then lets a push of auth, RLS,
billing, migration or route changes through without asking. Never record it while such a finding
remains; a new commit needs a new review.

**Blocking.** A `critical` or `major` finding stops `/be-ship` before the push until it is fixed
or the user overrides it. When the user says a finding is a false positive, add a row to
`agent-os/evals/false-positives.md` (date, reviewer, `file:line` · check, why it is wrong), so the
reviewers get tuned.
