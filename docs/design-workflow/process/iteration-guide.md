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
| 2 | **Is this the launch, or a change after it?** `launch` only while no iteration exists; otherwise `feat` (new capability), `change` (alters existing behaviour) or `fix` (corrects a merged iteration) | The type sets the mode: launch = initial, everything else = incremental | the folder name, `README.md` › Type |
| 3 | **What is the topic?** Lowercase kebab-case words, no digits (`pharmacy-returns`) | It names the folder in both repositories | the folder name, `README.md` › Topic |
| 4 | **Which repositories does it touch?** backend only, or backend and frontend | `--both` opens the same folder in clinozy-fe | `pnpm iteration:new … --both` |
| 5 | **Are you on the branch it will be built on?** `<type>/<topic>`, per the branch-naming rule | The README records the current branch | `README.md` › Branch |
| 6 | **Do the design inputs exist?** `PRD.md` and `schema-routes.md` from Claude Design (via clinozy-fe) | Planning cannot start without them | the iteration folder |
| 7 | **Is anything else open that this builds on?** an unmerged iteration touching the same entities or routes | Parallel iterations are fine, but overlaps are resolved before merging | `plans/coverage.md` › Overlap |

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
- Check the printed **Baseline**. It is the latest iteration on `main`; "(not on main yet)" means it
  fell back to this branch.
- Result: `iterations/<iteration>/` with `README.md` (`Status: planning`), `PRD.md`,
  `schema-routes.md` and `plans/product-plan.md`.

### Step 3 — Put the inputs in

- Write the **Summary** line in `README.md`.
- Replace `PRD.md` with the feature PRD — only the changed screens, flows and data (the launch:
  the full PRD).
- Replace `schema-routes.md` with Claude Design's output, copied **byte-for-byte** from the
  same-named clinozy-fe folder.
- Check the copies match: `pnpm iteration:list` in both repositories shows the same
  **schema-routes** value for the iteration.

**Ask before moving on:** is `PRD.md` final for this iteration? Does the schema-routes value match
clinozy-fe's?

### Step 4 — Plan the requirements

Say **"plan iteration `<iteration>`"** (or paste the
[iteration-planning prompt](../prompts/iteration-planning-prompt.md)). The **be-iteration-planning**
skill runs Steps 0–5 and stops after each:

| Skill step | What you answer or check |
| --- | --- |
| 0 — Confirm the iteration | pick the iteration from the eligibility table |
| 1 — Inventory | are the counts right — screens, flows, entities, operations? |
| 2 — Reconcile | for each PRD ↔ schema-routes mismatch: which source wins? |
| 3 — Blocking questions | the RED questions — ownership, scope, lifecycle, who may do what, background timing, channels, realtime, outside systems |
| 4a — Requirements | approve `plans/requirements/` |
| 4b — Features | approve the feature list, its order and the stories |
| 5 — Self-check | the skill runs `pnpm iteration:status <iteration> ready-for-approval` |

### Step 5 — Approve

Review `plans/`, then either:

```bash
pnpm iteration:status <iteration> approved
pnpm iteration:status <iteration> planning --reason "<what must change>"   # send it back
```

**Ask before approving:** is every coverage row covered or out of scope? Is every RED answered?
Are the open AMBER items acceptable?

### Step 6 — Kick off

Say **"kickoff iteration `<iteration>`"** (or paste the
[kickoff iteration prompt](../prompts/kickoff-iteration-prompt.md)). The **be-kickoff-iteration**
skill runs Steps 0–5 and stops after each:

| Skill step | What you answer or check |
| --- | --- |
| 0 — Confirm the iteration | pick it — eligible means `approved` with a Baseline of `none`, `done` or `frozen` |
| 1 — Read | does every requirement map to a work item? |
| 2 — Reconcile with the code | reuse, extend or new — do you agree with each verdict? |
| 3 — Technical questions | domain placement, foreign-key side, delete strategy, permission codes, realtime transport, queues |
| 4 — `KICKOFF.md` | schema first, contracts, build order, drivers, verification, ledger |
| 5 — Self-check | confirm `KICKOFF.md` → the skill runs `pnpm iteration:status <iteration> implementing` |

### Step 7 — Build, one ledger row at a time

- Take the next open row in `KICKOFF.md`'s ledger, in order.
- **NEW table** → paste the row into the [staged-build prompt](../../getting-started/staged-build-prompt.md).
- **CHANGE table, flow or async piece** → `/be-build-requirement`.
- After each row: `pnpm validate`; mark the row `done`. Before the PR: `pnpm ci:local`.

**Ask after every row:** did its gates pass? Is anything deferred — and did you agree to it?

### Step 8 — Accept

Fill `plans/acceptance.md` — a Result and Evidence for every item. When every ledger row is closed:

```bash
pnpm iteration:status <iteration> done
```

### Step 9 — Freeze and hand over

- If newer iterations reached `main` meanwhile: update the README's Baseline and resolve every
  overlap (the same entity, route or screen changed by both).
- In the last commit before the merge:

  ```bash
  pnpm iteration:status <iteration> frozen
  ```

- Raise the PR yourself — agents never push, open a PR or merge. After the merge the folder is never
  edited; a correction is a new `fix` iteration.

## Status at each step

| After step | Status |
| --- | --- |
| 2 — Open | `planning` |
| 4 — Plan | `ready-for-approval` |
| 5 — Approve | `approved` |
| 6 — Kick off | `implementing` |
| 8 — Accept | `done` |
| 9 — Freeze | `frozen` |

`pnpm iteration:list` shows where every iteration stands.
