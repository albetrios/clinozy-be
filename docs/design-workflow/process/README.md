# Iteration → clinozy-be process

How a design iteration becomes built, verified backend work — two phases: **planning** writes the
plan (no code), **kickoff** implements it one ROUTE row at a time. The iteration rules (naming,
folder, Baseline, lifecycle, commands) are in [iterations/README.md](../../../iterations/README.md);
every step with its questions is in the [step-by-step guide](iteration-guide.md).

## The flow

```mermaid
flowchart TB
  NEW["pnpm iteration:new<br/>Status: planning"] --> INTAKE["pnpm iteration:intake --mode full|overlay|brief<br/>full snapshot → intake-files/ · --check gate"]
  INTAKE --> PLAN["be-iteration-planning — no code<br/>Steps 0–6 → KICKOFF.md + plans/"]
  PLAN --> READY["Status: ready-for-approval"]
  READY -->|your go-ahead| APPROVED["Status: approved<br/>KICKOFF.md + intake-files/ freeze"]
  APPROVED --> KICK["be-kickoff-iteration<br/>Step 0 confirm → Status: implementing"]
  KICK --> ROW["one ROUTE row: do → verify →<br/>AS-BUILT.md row → impact check → your review"]
  ROW -->|next row| ROW
  ROW --> DONE["gates · acceptance.md · AS-BUILT summary<br/>Status: done"]
  DONE --> FROZEN["Status: frozen<br/>last commit before the merge"]
```

| Step | Who / what | Output | Stops for |
| --- | --- | --- | --- |
| Open | `pnpm iteration:new <type> [topic]` | the folder + README (`Status: planning`) | the opening questions ([guide](iteration-guide.md)) |
| Intake | `pnpm iteration:intake <iteration> <source> [--mode full\|overlay\|brief]` | a full snapshot in `intake-files/`; the README's Drop, Intake and Schema-routes rows | a missing mandatory file; a different snapshot already there |
| Plan | **be-iteration-planning**, [prompt](../prompts/iteration-planning-prompt.md) | `KICKOFF.md` (plan + ROUTE ledger) and `plans/`; `Status: ready-for-approval` | which iteration and Baseline (Step 0); every step; RED questions |
| Approve | you — `pnpm iteration:status <iteration> approved` | `Status: approved`, logged in `plans/decisions.md` | — |
| Kick off | **be-kickoff-iteration**, [prompt](../prompts/kickoff-iteration-prompt.md) | `Status: implementing` | which iteration (Step 0) |
| Build | one ROUTE row at a time | code, migrations, tests; one `AS-BUILT.md` row each | your review after every row; any scope change |
| Close | the gates, `/be-pre-merge-review` (review only) | `plans/acceptance.md` filled, `AS-BUILT.md` summary; `Status: done` | — |
| Freeze | the last commit before the merge | `Status: frozen`; never edited again | — |

## Rules that hold the flow together

- **The snapshot is always full.** Whatever arrived — the whole drop (`full`), only the changed
  files (`overlay`) or only a written change (`brief`, a `BRIEF.md`) — `intake-files/` holds a full
  snapshot. An incremental delta is the designer's "What changed" notes plus
  `pnpm iteration:diff <baseline> <iteration>` (brief: `BRIEF.md`, and nothing else changed) — a diff
  of `intake-files/` only, so the Baseline's `intake-files/` is mandatory. Anything the diff shows
  that the notes omit is a finding.
- **The gate comes first.** Planning and kickoff run `pnpm iteration:intake <iteration> --check`
  before anything else and stop when it fails: a missing mandatory file or an Intake hash that no
  longer matches goes back to whoever placed the drop.
- **Deviations are carried forward.** `AS-BUILT.md` › Standing deviations lists where the code
  differs from the drop; the next iteration copies it and plans against what was actually built.
- **The user confirms the Baseline.** Planning Step 0 suggests the latest `done` / `frozen`
  iteration in this repository; the user confirms it or picks another
  (`pnpm iteration:baseline`).
- **Confirm the iteration first.** Both skills start with a `pnpm iteration:list` table of which
  iterations are eligible and why, recommend the earliest-opened one (the launch always first), and
  wait for your confirmation — never pick silently.
- **Reviewable as it goes.** Planning keeps the database changes (`plans/db-changes.md`, drawn by
  the DB Viewer's plan mode), the proposed routes (`plans/route-changes.md`) and the background work
  (`plans/worker-changes.md`) current at every step, with before → after for anything that changes,
  and every step ends with a step review — what changed, the review links, continue or change — so
  nothing waits for a PR diff.
- **Planning is WHAT, never HOW.** `KICKOFF.md` and `plans/` hold requirements and decisions — no
  SQL, endpoint paths (the proposals in `plans/route-changes.md` are the one exception), `src/` paths
  or queue names. Each row's technical design is decided while it
  is built and recorded in `AS-BUILT.md`.
- **Schema first.** The ROUTE runs tables (in dependency order) → features → background work →
  flows → acceptance; an incremental ROUTE runs schema changes first and never edits an existing
  migration.
- **Every ROUTE row has a driver.** A NEW table goes through the
  [staged-build prompt](../../getting-started/staged-build-prompt.md); a CHANGE table, a flow or
  background work through `/be-build-requirement` ([requirement intake](../../getting-started/requirement-intake.md)).
- **Scope changes stop and ask.** A row added or removed, an acceptance changed or the order changed
  is recorded in `plans/decisions.md` and `AS-BUILT.md` only after you agree. `KICKOFF.md` itself is
  frozen at approval.
- **Status moves through one command** — `pnpm iteration:status`, one step at a time (or back to
  `planning` with `--reason`); it signs the README's History.
- **Agents never push, open a PR or merge.** You raise the PR.

## Related

- Skills: [`be-iteration-planning`](../../../agent-os/skills/be-iteration-planning/SKILL.md) ·
  [`be-kickoff-iteration`](../../../agent-os/skills/be-kickoff-iteration/SKILL.md)
- Prompts: [iteration-planning-prompt.md](../prompts/iteration-planning-prompt.md) ·
  [kickoff-iteration-prompt.md](../prompts/kickoff-iteration-prompt.md)
- Every step with its questions: [iteration-guide.md](iteration-guide.md) — `/be-iteration` walks it
- Building a NEW table: [staged-build-prompt.md](../../getting-started/staged-build-prompt.md)
- Requirements outside an iteration: [requirement-intake.md](../../getting-started/requirement-intake.md)
- The iteration rules: [iterations/README.md](../../../iterations/README.md)
