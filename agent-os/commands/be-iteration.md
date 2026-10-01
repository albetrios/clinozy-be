---
description: Walk a design iteration one step at a time — ask the opening questions, open it, plan, approve, kick off, build, accept, freeze
argument-hint: '[iteration] e.g. "feat-pharmacy-returns-2026-10-06-kqzx", or empty to open a new one'
---

Guide a design iteration one step at a time: **$ARGUMENTS**

The steps and their questions are in `docs/design-workflow/process/iteration-guide.md`; the rules
in `iterations/README.md`. Do **one** step, show its result, then stop and ask before the next.

1. **Where are we?** Run `pnpm iteration:list` and show the table.
   - No argument and the user wants a new iteration → step 2.
   - An iteration is named (or picked) → read its `README.md` Status and jump to the matching
     step of the guide: `planning` without `plans/` → inputs (Step 3) or planning (Step 4);
     `ready-for-approval` → approve (Step 5); `approved` → kick off (Step 6); `implementing` →
     build the next open ledger row (Step 7) or accept (Step 8); `done` → freeze (Step 9);
     `frozen` → nothing to do — a correction is a new `fix` iteration.
2. **Opening questions** — ask with **AskUserQuestion** (at most 4 per call, one recommended
   option each), never guess:
   - What changes, in one line? (the Summary)
   - Type: `launch` only while no iteration exists; otherwise `feat`, `change` or `fix`.
   - Topic: lowercase kebab-case, no digits.
   - Repositories: backend only, or backend and frontend (`--both`).
   - Branch: is the current branch `<type>/<topic>`? If not, offer to create it.
   - Inputs: do `PRD.md` and `schema-routes.md` exist yet?
3. **Open it** — run `pnpm iteration:new <type> [topic] [--both] --dry-run`, show the name and
   Baseline, and run it for real only after the user confirms. Write the Summary into the README.
4. **Continue step by step** through the guide — inputs → **be-iteration-planning** → approval →
   **be-kickoff-iteration** → one ledger row at a time → acceptance → freeze. The two skills stop
   after each of their own steps; keep those stops.
5. **Status changes only through** `pnpm iteration:status <iteration> <status> [--reason "<text>"]`
   — never by editing the README.

Never push, open a PR or merge — the user raises PRs.
