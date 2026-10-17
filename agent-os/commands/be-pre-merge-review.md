---
description: Run the read-only pre-merge review pipeline and aggregate one report
argument-hint: (no arguments — reviews the current diff)
allowed-tools: Bash(git diff*), Bash(pnpm*)
---

Read `REVIEW.md` (repo root) first — it defines the severity ladder, the repo-specific checks in priority order, the skip paths, and the findings format every reviewer in this pipeline uses.

Run the **pre-merge review** pipeline over the current diff (`git diff main...HEAD`, plus uncommitted changes):

1. Read `agent-os/agents/pipelines.json` → `pre-merge-review`. Its `steps` are the reviewers, its `when` says which ones the diff needs: the SQL design, RLS, idempotency and production-hardening reviewers when the diff touches their files, the verifier always.
2. **Start every needed reviewer at once, in the background** — one message with one agent call each, each told the diff range and to return findings in `REVIEW.md` → Findings format. A session capped at fewer parallel agents runs them in batches of that size. Do not read their transcripts while they run; each one's report arrives when it finishes.
3. **Aggregate one report** as `aggregate` says: every finding in the one format, sorted by severity (critical first), the same `file:line` and check from two reviewers merged into one line, anything under `REVIEW.md` → Skip dropped, at most two nits. Then the verifier's verdict and evidence, then each reviewer's `Satisfied` list in one line per check.

Each finding names the procedural skill that fixes it (`handoff`: agent finds, skill fixes). This is review-only: do not edit files.
