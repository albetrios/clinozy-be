# Iteration guide — step by step

Every step of a design iteration in clinozy-be, in order: the questions to answer first, then what
to run. Do one step, check its result, then move to the next. `/be-iteration` walks these steps with
you and asks the questions; the rules behind them are in
[iterations/README.md](../../../iterations/README.md), the flow on one page in
[README.md](README.md).

## Before you start — the opening questions

Answer these before running anything. `/be-iteration` asks them for you.

| # | Question | Why it matters | Where the answer goes |
| --- | --- | --- | --- |
| 1 | **What changes, in one line?** | It becomes the iteration's Summary | `README.md` › Summary |
| 2 | **Is this the launch, or a change after it?** `launch` only while no iteration exists; otherwise `feat` (new capability), `change` (alters existing behaviour) or `fix` (corrects a merged iteration) | The type names the folder; the Baseline sets the mode | the folder name, `README.md` › Type |
| 3 | **What is the topic?** Lowercase kebab-case words, no digits (`pharmacy-returns`) | It names the folder in both repositories | the folder name, `README.md` › Topic |
| 4 | **Which repositories does it touch?** backend only, or backend and frontend | `--both` opens the same folder in clinozy-fe and copies `PRD.md` + `schema-routes.md` there | `iteration:new … --both`, `iteration:intake … --both` |
| 5 | **Are you on the branch it will be built on?** `<type>/<topic>`, per the branch-naming rule | The README records the current branch | `README.md` › Branch |
| 6 | **Where is the drop?** The folder with the **full** drop — `PRD.md`, `schema-routes.md` (and `design-overview.md` if there is one) — never just the changed files | `iteration:intake` copies it exactly as delivered | `intake-files/`, `README.md` › Drop source |
| 7 | **What does it build on?** The Baseline — for a later iteration, normally the latest `done` / `frozen` one, and it must have its own `intake-files/` | The incremental delta is a diff of the two `intake-files/` folders | `README.md` › Baseline (confirmed at planning Step 0) |

## The steps

### Step 1 — Branch

```bash
git switch -c feat/pharmacy-returns
```

Name it `<type>/<topic>` (see `agent-os/rules/be-git-branch-naming.mdc`). Never work on `main`.

### Step 2 — Open the iteration

```bash
pnpm iteration:new feat pharmacy-returns --both --dry-run   # check the name and Baseline first
pnpm iteration:new feat pharmacy-returns --both
```

- The launch takes no topic: `pnpm iteration:new launch`.
- Result: `iterations/<iteration>/README.md` (`Status: planning`) — nothing else yet. Write its
  **Summary** line.
- The printed Baseline is a suggestion (the latest `done` / `frozen` iteration in this repository);
  you confirm it at planning Step 0.

### Step 3 — Place the drop

```bash
pnpm iteration:intake <iteration> <source-folder> --both --dry-run   # check first
pnpm iteration:intake <iteration> <source-folder> --both
```

- The **full** drop goes into `intake-files/`, flat and exactly as delivered; the README's
  Drop placed, Drop source and Schema-routes rows are filled.
- It stops when `PRD.md` or `schema-routes.md` is missing, and when a file already there differs —
  re-run with `--replace` while the iteration is still `planning`.
- With `--both`, `pnpm iteration:list` in both repositories shows the same **Schema-routes** value.

**Ask before moving on:** is this the final drop for the iteration? Do the Schema-routes values match
in both repositories?

### Step 4 — Plan (no code)

Say **"plan iteration `<iteration>`"** (or paste the
[iteration-planning prompt](../prompts/iteration-planning-prompt.md)). The **be-iteration-planning**
skill runs Steps 0–6 and stops after each:

| Skill step | What you answer or check |
| --- | --- |
| 0 — Confirm | pick the iteration from the eligibility table; incremental: confirm the Baseline (saved with `pnpm iteration:baseline`) |
| 1 — Intake check | the drop is complete; are the counts right — screens, flows, entities, operations? |
| 2 — Delta (incremental) | `pnpm iteration:diff <baseline> <iteration>` vs the designer's notes — are the findings (changes the notes omit) intended? |
| 3 — Reconcile | for each PRD ↔ schema-routes mismatch: which source wins? |
| 4 — Blocking questions | the RED questions — ownership, scope (organization or narrower), lifecycle and delete policy, who may do what, background timing, notification channels, realtime, outside systems |
| 5 — KICKOFF.md + plans/ | the plan, the ROUTE ledger (one row per table, background piece, flow), the requirements, the stories |
| 6 — Self-check | the skill runs `pnpm iteration:status <iteration> ready-for-approval` |

### Step 5 — Approve

Review `KICKOFF.md` and `plans/`, then either:

```bash
pnpm iteration:status <iteration> approved
pnpm iteration:status <iteration> planning --reason "<what must change>"   # send it back
```

**Ask before approving:** is every coverage row covered or out of scope? Is every RED answered? Is
the ROUTE order right — schema first? Are the open AMBER items acceptable? From approval on,
`KICKOFF.md` and `intake-files/` are frozen.

### Step 6 — Kick off and build, one ROUTE row at a time

Say **"kickoff iteration `<iteration>`"** (or paste the
[kickoff iteration prompt](../prompts/kickoff-iteration-prompt.md)). The **be-kickoff-iteration**
skill confirms the iteration (eligible: `approved`, Baseline `none` or `done`/`frozen`), runs
`pnpm iteration:status <iteration> implementing`, then for every ROUTE row:

1. builds it through its driver — a **NEW table** through the
   [staged-build prompt](../../getting-started/staged-build-prompt.md) (its Stage 1 is where you
   approve the table design); a **CHANGE table, flow or background work** through
   `/be-build-requirement`;
2. verifies it (`pnpm validate`, the row's acceptance and tests);
3. writes the row into `AS-BUILT.md` — planned, actually built, difference, why, decision, commit;
4. checks the impact on upcoming rows — a **scope** change (a row added or removed, an acceptance
   changed, the order changed) stops and asks you first;
5. stops for your review.

**Ask after every row:** does what was built match the plan — and if not, is the reason in
`AS-BUILT.md`? Is anything deferred — and did you agree to it?

### Step 7 — Close

The skill runs the repository's gates (`pnpm validate`, `pnpm ci:local`), `/be-pre-merge-review` as
a review only, fills `plans/acceptance.md`, writes the `AS-BUILT.md` summary (planned-not-built,
built-not-planned, follow-ups), then:

```bash
pnpm iteration:status <iteration> done
```

### Step 8 — Freeze and hand over

- If another iteration reached `main` meanwhile: resolve every overlap (the same entity, route or
  screen changed by both).
- In the last commit before the merge:

  ```bash
  pnpm iteration:status <iteration> frozen
  ```

- Raise the PR yourself — agents never push, open a PR or merge. After the merge the folder is never
  edited; a correction is a new `fix` iteration.

## Status at each step

| After step | Status |
| --- | --- |
| 2 — Open, 3 — Place the drop | `planning` |
| 4 — Plan | `ready-for-approval` |
| 5 — Approve | `approved` |
| 6 — Kick off | `implementing` |
| 7 — Close | `done` |
| 8 — Freeze | `frozen` |

`pnpm iteration:list` shows where every iteration stands.
