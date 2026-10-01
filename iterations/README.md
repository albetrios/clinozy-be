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
| `intake-files/` | the files received from outside, **exactly as delivered**, flat, never edited | `iteration:intake` |
| `KICKOFF.md` | the plan and its ordered ROUTE ledger | be-iteration-planning |
| `plans/` | our supporting documents: `decisions.md`, `coverage.md`, `requirements/`, `features/`, `acceptance.md` | be-iteration-planning (+ scope decisions during implementation) |
| `AS-BUILT.md` | per ROUTE row: planned · actually built · difference · why · decision · commit; revisions to upcoming rows; a closing summary | be-kickoff-iteration |

- **`intake-files/`** holds the **full drop** in every iteration, not only the launch. Backend
  required set: `PRD.md`, `schema-routes.md`; optional: `design-overview.md`. It is locked once the
  Status is `approved` or later.
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
| Schema-routes | the first 12 characters of the sha256 of `intake-files/schema-routes.md` |

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
pnpm iteration:intake <iteration> <source-folder> --both # place the drop + check it
pnpm iteration:baseline <iteration> <baseline|none>      # record the confirmed Baseline
pnpm iteration:diff <baseline> <iteration> [--json]      # the delta: intake-files/ only
pnpm iteration:status <iteration> <status> [--reason "<text>"]
pnpm iteration:list                                      # Name · Type · Owner · Opened · Baseline · Status · Schema-routes · Drop placed
```

Every command takes `--help`. `iteration:new` and `iteration:intake` take `--dry-run`; `--both` works
on the same-named folder in the sibling repository (`--sibling <path>` overrides where it is).
