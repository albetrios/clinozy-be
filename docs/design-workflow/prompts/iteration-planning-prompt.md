# Iteration planning prompt

> The **`be-iteration-planning`** skill (`agent-os/skills/be-iteration-planning/SKILL.md`) does
> the work — saying "plan iteration <name>" triggers it directly. This prompt is the explicit
> paste-in entry point.

**Paste this to Claude Code (here, in clinozy-be)** once the iteration's drop is in
`intake-files/` (`pnpm iteration:intake`). Set `ITERATION` and, if you want, the scope — the mode
comes from the iteration's README (Baseline `none` = initial, otherwise incremental).

## When to use

At the start of every iteration, before any code. The skill confirms the iteration and its Baseline
with you, checks the intake, takes the delta from `pnpm iteration:diff` when the iteration is
incremental, reconciles the PRD with `schema-routes.md`, asks the blocking questions only you can
answer, reviews the routes sub-domain by sub-domain in `plans/routes-final.md` (each sub-domain final only after
your OK — [template](../process/routes-final-template.md)), and writes `KICKOFF.md` — the plan with its ordered ROUTE ledger — plus `plans/`
(decisions, coverage, `db-changes.md`, `route-changes.md`, `worker-changes.md`, requirements,
feature stories, acceptance). It writes no code, and no technical design outside the route review and the proposed routes in
`route-changes.md`, and ends at `Status: ready-for-approval`. Your go-ahead sets
`Status: approved`; then use the [kickoff iteration prompt](kickoff-iteration-prompt.md).

## Reviewing while it plans — no PR diff

- **The database changes** are one file per iteration, `plans/db-changes.md` (the Mermaid data
  diagrams), kept current at every step. See them drawn in the DB Viewer's plan mode: the agent gives
  you the URL (`pnpm db:viewer`) — click the iteration under ◇ Plans to see it as Latest + its
  changes, dashed where not built yet. New tables are named like the existing ones (plural
  snake_case); the skill asks you which domain each group goes under and records it on the
  diagram (`clinical.patients`) — until then the viewer shows them under `app`.
- **The routes** are one file per iteration, `plans/route-changes.md` — a table per area of the
  proposed routes (NEW / CHANGED / REMOVED, method, path, access, the operation each serves, its
  source line), kept current at every step, with a **before → after** row for every route that
  changes only in part. Kickoff confirms each route as it builds it.
- **The background work** is one file per iteration, `plans/worker-changes.md` — one row per piece of
  work that runs without a user (what happens, when it runs, what it touches, what happens on failure,
  who is told, its source line), in plain words, with before → after for anything that changes.
- **The requirements** say what changes the same way: each `plans/requirements/` file ends with a
  before → after table for every requirement that changes or removes what exists today.
- **Every step ends with a step review:** what changed (clickable links), the review links above,
  what needs you, and one question — continue, or change something. Ask for any change there; the
  agent updates the files and shows the review again before moving on.

## The prompt

```text
Plan iteration <ITERATION> with the be-iteration-planning skill. Scope: <everything in the drop | the named features>. Requirements only — no code. Review the routes sub-domain by sub-domain in plans/routes-final.md (from docs/design-workflow/process/routes-final-template.md) and stop for my OK on each sub-domain. Keep plans/db-changes.md, plans/route-changes.md and plans/worker-changes.md current at every step, with before → after for anything that changes, and end every step with its step review (what changed, the DB Viewer URL and the change files, what needs me, continue or change).
```

`<ITERATION>` is the folder name, e.g. `launch-2026-09-30-jxmr` or
`feat-pharmacy-returns-2026-10-06-kqzx` (`pnpm iteration:list` shows them all).

## Related

- The whole flow: [process/README.md](../process/README.md) · every step: [iteration-guide.md](../process/iteration-guide.md)
- The skill: [`be-iteration-planning`](../../../agent-os/skills/be-iteration-planning/SKILL.md)
- The iteration rules: [iterations/README.md](../../../iterations/README.md)
