---
description: Run the read-only production-readiness pipeline and aggregate one report
argument-hint: (no arguments — sweeps main since the last release tag before a release)
allowed-tools: Bash(git*), Bash(pnpm*)
---

Read `REVIEW.md` (repo root) first — the severity ladder and the findings format. Then run the
**`be-prod-readiness`** pipeline defined in [`agent-os/agents/pipelines.json`](../agents/pipelines.json)
as read-only agents before a release, and aggregate one report. The pipeline (not this prose) is the
source of truth for the steps and the handoffs:

- **be-production-reviewer** — the readiness review and plan of **be-path-to-production** step 1.
- **be-production-hardening-reviewer** — the production-hardening sweep.
- **be-dependency-auditor** — `pnpm audit` and the fix plan.

They run at once, in the background. Scope: `git log --oneline <last tag>..origin/main`. Each
finding is one line in `REVIEW.md` → Findings format and names the procedural skill that fixes it,
per the pipeline's `handoff` map. Produce one report: satisfied items, then the findings by severity —
`critical` and `major` block the release, `minor` and `nit` are the optional improvements. This is
review-only: do not edit files. It is step 1 of **`/be-release`**; clinozy-fe runs the same
sweep as **`/fe-prod-readiness`**.
