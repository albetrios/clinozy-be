# Design iterations

An iteration is one product/design change, recorded as a folder under `iterations/`. It is a
product/design iteration, **not** an app release — releases are the `package.json` version and
`CHANGELOG.md`.

How an iteration is planned and built: [docs/design-workflow/process/README.md](../docs/design-workflow/process/README.md);
every step with the questions to answer: [iteration-guide.md](../docs/design-workflow/process/iteration-guide.md)
(`/be-iteration` walks it with you). There is no shared index file — `pnpm iteration:list` is the
index.

## Naming

`iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/`

| Part | Rule |
| --- | --- |
| `<type>` | `launch`, `feat`, `change` or `fix` |
| `<topic>` | lowercase kebab-case words, no digits. `launch` has no topic: `launch-<YYYY-MM-DD>-<id>` |
| `<YYYY-MM-DD>` | the day the iteration was opened |
| `<id>` | four random lowercase letters, so names stay unique across people |

Examples: `launch-2026-09-30-jxmr`, `feat-pharmacy-returns-2026-10-06-kqzx`. There is only ever one
launch. The date is a value (when the iteration was opened) and the only part that carries digits.

The same name is used in clinozy-fe and clinozy-be. Create the folder only in the repository the
change touches; `pnpm iteration:new <type> <topic> --both` creates it in both.

## The folder

| Path | Holds | Written by |
| --- | --- | --- |
| `README.md` | the field table, then a `## History` list | `iteration:new`, then only the commands |
| `intake-files/` | the **full snapshot** — files received from outside, exactly as delivered, flat, never edited (see Intake modes) | `iteration:intake` |
| `KICKOFF.md` | the plan and its ordered ROUTE ledger | be-iteration-planning |
| `plans/` | our supporting documents: `decisions.md`, `coverage.md`, `requirements/`, `features/`, `acceptance.md` | be-iteration-planning (+ scope decisions during implementation) |
| `AS-BUILT.md` | per ROUTE row: planned · actually built · difference · why · decision · commit; revisions to upcoming rows; a closing summary; the **Standing deviations** | be-kickoff-iteration |

- **`intake-files/`** holds a **full snapshot** in every iteration, not only the launch, whatever
  arrived (see Intake modes). Backend mandatory set: `PRD.md`, `schema-routes.md` (+ `BRIEF.md` in
  brief mode); optional: `design-overview.md`, a carried-forward `BRIEF.md`. It is locked once the
  Status is `approved` or later — re-recording the hash included.
- **`AS-BUILT.md` › Standing deviations** is the complete list of where the code differs from the
  drop. The launch starts it empty; each iteration copies its Baseline's list, adds what it
  deliberately builds differently and removes what it resolves. Planning reads it, so a later
  iteration plans against what was actually built.
- **`KICKOFF.md`** is frozen at approval: afterwards only its ROUTE Status column and
  "revised → AS-BUILT #n" markers change.
- `schema-routes.md` is the same file, byte-for-byte, in the same-named clinozy-fe iteration —
  `pnpm iteration:list` shows its fingerprint in both repositories.

## README fields

| Field | Value |
| --- | --- |
| Type | `launch`, `feat`, `change` or `fix` |
| Topic | the kebab-case topic; `—` for launch |
| Owner | the person driving it (`git config user.name`) |
| Opened | `YYYY-MM-DD` |
| Branch | the branch it is built on |
| Baseline | `none` (initial), an earlier iteration (incremental), or `—` until the user confirms it |
| Status | `planning`, `ready-for-approval`, `approved`, `implementing`, `done` or `frozen` |
| Summary | one line on what it changes — the one field you write by hand |
| Drop placed | the day `iteration:intake` placed the drop |
| Drop source | where the drop came from |
| Intake mode | `full`, `overlay` or `brief` — how the snapshot was built |
| Intake note | what was received versus carried forward: `<n> received`, or `<n> received (<names>) · <m> carried forward from <baseline>` |
| Schema-routes | the first 12 characters of the sha256 of `intake-files/schema-routes.md` |
| Intake hash | the first 12 characters of one sha256 over the whole snapshot — any added, removed or edited file changes it |

Below the table, a `## History` list records every Status and Baseline change, one line each:
`- <date> · <from> → <to> · <reason or —> · <git user.name>` (a Baseline change reads
`Baseline <from> → <to>`). The commands write every table value and the History — never edit those by
hand — except **Summary**, the one line you write yourself after `pnpm iteration:new`.

## Mode and Baseline

- **Baseline `none` → MODE initial** — the first iteration in this repository: everything is new.
- **Otherwise MODE incremental**, against a Baseline **the user confirms** at planning Step 0 (saved
  with `pnpm iteration:baseline`). The suggestion is the latest `done` / `frozen` iteration in this
  repository.
- The incremental delta is the designer's "What changed" notes **plus**
  `pnpm iteration:diff <baseline> <iteration>`, which compares the two iterations' `intake-files/`
  **only** (never the README, `KICKOFF.md`, `plans/` or `AS-BUILT.md`). The Baseline's
  `intake-files/` is therefore mandatory: `iteration:baseline` refuses a Baseline without the required
  set, and `iteration:diff` refuses an iteration without `intake-files/`. Anything the diff shows that
  the notes omit is a finding.
- Parallel branches are fine. Before merging, if another iteration reached `main` meanwhile, check
  overlap — the same entity, route or screen changed by both — and resolve it in review.

## Intake modes and the gate

`pnpm iteration:intake <iteration> <source> --mode <mode>` always leaves a **full snapshot** in
`intake-files/`; `<source>` is a folder or a single file.

| Mode | What arrived | The snapshot |
| --- | --- | --- |
| `full` (default; always the launch) | the whole drop | exactly what was received |
| `overlay` | only the changed files | the Baseline's snapshot with them laid over it (at least one file; nothing is removed) |
| `brief` | only a written change, `BRIEF.md` (template: `tooling/iterations/templates/BRIEF.md`) | the Baseline's snapshot plus `BRIEF.md`; any other received file must match the Baseline's byte for byte |

- `overlay` and `brief` need a confirmed Baseline (not `none` or `—`) whose intake passes the gate.
- A `BRIEF.md` must have the sections What changes · Why · Affected screens, entities and routes ·
  Rules · Acceptance criteria · Out of scope — "none" is an answer, a missing section is not.
- Replacing a different existing snapshot (removals included) needs `--replace`, only while
  planning. From `approved` on, any change is refused.
- `--both` builds the sibling's same-named iteration in the same mode on **its own** Baseline, with
  `PRD.md` and `schema-routes.md` (+ `BRIEF.md` in brief mode) from this snapshot.

**The gate**, `pnpm iteration:intake <iteration> --check [--baseline <baseline>]`, proves the
mandatory set is present and the recomputed Intake hash equals the README's (for the Baseline too),
and that an overlay or brief was built on the README's Baseline. It exits 1 with
"Gate failed — 1 problem." (or "— 2 problems.", and so on) and "Stop here: write nothing, change no
status.", then one line per problem with its fix. Planning and kickoff run it first and stop when
it fails.

The Intake hash is one sha256 over every flat, visible file of `intake-files/` — names in code-unit
order, each fed as its name, a NUL, its bytes and a NUL — cut to 12 characters; it is computed the
same way in both repositories.

## Lifecycle

Status moves one step at a time with `pnpm iteration:status <iteration> <status>`:

| Status | Set by | When |
| --- | --- | --- |
| `planning` | `pnpm iteration:new` | the folder is opened; the drop is placed and planned |
| `ready-for-approval` | be-iteration-planning | `KICKOFF.md` and `plans/` pass the self-check |
| `approved` | the user's go-ahead | logged in `plans/decisions.md`; `KICKOFF.md` and `intake-files/` freeze |
| `implementing` | be-kickoff-iteration | the user confirms the iteration to kick off |
| `done` | be-kickoff-iteration | every ROUTE row is closed, `plans/acceptance.md` filled, `AS-BUILT.md` summarized |
| `frozen` | the last commit before the merge | the iteration merges to `main` |

`ready-for-approval`, `approved` or `implementing` may go back to `planning` with
`--reason "<why>"`; nothing else is allowed. Never edit a frozen iteration — a correction is a new
`fix` iteration.

## Commands

```bash
pnpm iteration:new feat pharmacy-returns --both          # open (README only)
pnpm iteration:intake <iteration> <source> [--mode full|overlay|brief] --both   # place the snapshot
pnpm iteration:intake <iteration> --check [--baseline <baseline>]                 # the gate
pnpm iteration:baseline <iteration> <baseline|none>      # record the confirmed Baseline
pnpm iteration:diff <baseline> <iteration> [--json]      # the delta: intake-files/ only
pnpm iteration:status <iteration> <status> [--reason "<text>"]
pnpm iteration:list   # Name · Type · Owner · Opened · Baseline · Status · Intake mode · Schema-routes · Intake hash · Drop placed
```

Every command takes `--help`. `iteration:new` and `iteration:intake` take `--dry-run`; `--both` works
on the same-named folder in the sibling repository (`--sibling <path>` overrides where it is).
