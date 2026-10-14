---
description: Walk a design iteration one step at a time — the opening questions, open it, place the drop, plan, approve, kick off row by row, close, freeze
argument-hint: '[iteration] e.g. "feat-pharmacy-returns-2026-10-06-kqzx", or empty to open a new one'
---

Guide a design iteration one step at a time: **$ARGUMENTS**

The steps and their questions are in `docs/design-workflow/process/iteration-guide.md`; the rules
in `iterations/README.md`. Do **one** step, show its result, then stop and ask before the next.
During planning every stop is a **step review** (be-iteration-planning › Step review): what changed
as clickable links, the DB Viewer URL in plan mode and links to the change files —
`plans/db-changes.md`, `plans/route-changes.md`, `plans/worker-changes.md` — when they changed, what
needs the user, then continue or change.

1. **Where are we?** Run `pnpm iteration:list` and show the table.
   - No argument and the user wants a new iteration → step 2.
   - An iteration is named (or picked) → read its README and jump to the matching step of the
     guide: `planning` without `intake-files/` → place the drop (Step 3); `planning` with it →
     plan (Step 4); `ready-for-approval` → approve (Step 5); `approved` → kick off (Step 6);
     `implementing` → the next open ROUTE row, or close (Step 7); `done` → freeze (Step 8);
     `frozen` → nothing to do — a correction is a new `fix` iteration.
2. **Opening questions** — ask with **AskUserQuestion** (at most 4 per call, one recommended
   option each), never guess:
   - What changes, in one line? (the Summary)
   - Type: `launch` only while no iteration exists; otherwise `feat`, `change` or `fix`.
   - Topic: lowercase kebab-case, no digits.
   - Repositories: backend only, or backend and frontend (`--both`).
   - Branch: is the current branch `<type>/<topic>`? If not, offer to create it.
   - The drop: which folder (or single file) holds what arrived — the whole drop (`PRD.md`,
     `schema-routes.md`), only the changed files, or only a `BRIEF.md`?
3. **Open it** — `pnpm iteration:new <type> [topic] [--both] --dry-run`, show the name and the
   suggested Baseline, and run it for real only after the user confirms. Write the Summary.
4. **Place the drop** — ask what arrived: the whole drop (`full`), only the changed files
   (`--mode overlay`) or only a `BRIEF.md` (`--mode brief`, template
   `tooling/iterations/templates/BRIEF.md`). Run `pnpm iteration:intake <iteration> <source>
   [--mode …] [--both] --dry-run`, show the report, then run it for real after the user confirms,
   and check it with `pnpm iteration:intake <iteration> --check`.
5. **Continue step by step** through the guide — **be-iteration-planning** (Steps 0–7; Step 0
   confirms the Baseline with `pnpm iteration:baseline`; Step 5 is the route review, one sub-domain at a
   time) → approval → **be-kickoff-iteration**
   (one ROUTE row at a time, `AS-BUILT.md`) → close → freeze. Both skills stop after each of their
   own steps; keep those stops.
6. **README values change only through the commands** — `pnpm iteration:status`,
   `pnpm iteration:baseline`, `pnpm iteration:intake` — never by editing the README. The one
   exception is the Summary line, written by hand after `pnpm iteration:new`.

Never push, open a PR or merge — the user raises PRs.
