# Design iterations

An iteration is one product/design change, recorded as a folder under `iterations/`. It is a
product/design iteration, **not** an app release — releases are the `package.json` version and
`CHANGELOG.md`.

Open one with `pnpm iteration:new`; list them with `pnpm iteration:list`. There is no shared index
file — each iteration describes itself in its own `README.md`. How an iteration is planned, kicked
off and built: [docs/design-workflow/process/README.md](../docs/design-workflow/process/README.md);
every step with the questions to answer: [iteration-guide.md](../docs/design-workflow/process/iteration-guide.md)
(`/be-iteration` walks it with you).

## Naming

`iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/`

| Part | Rule |
| --- | --- |
| `<type>` | `launch`, `feat`, `change` or `fix` |
| `<topic>` | lowercase kebab-case words, no digits. `launch` has no topic: `launch-<YYYY-MM-DD>-<id>` |
| `<YYYY-MM-DD>` | the day the iteration was opened |
| `<id>` | four random lowercase letters, so names stay unique across people |

Examples: `launch-2026-09-30-jxmr`, `feat-pharmacy-returns-2026-10-06-kqzx`.

The date is a value (when the iteration was opened); the type, topic and `<id>` carry no digits.

The same name is used in clinozy-fe and clinozy-be. Create the folder only in the repo(s) the change
touches; `pnpm iteration:new <type> <topic> --both` creates it in both.

## Launch and later iterations

- **launch** — the full snapshot: the full PRD, the full schema-routes and every table plan. MODE
  initial, Baseline `none`. There is only ever one launch.
- **feat**, **change**, **fix** — one person, one branch, **changes only**: a feature PRD for the
  changed screens, flows and data, a `schema-routes.md` scoped to the changed screens, and the plans
  and kickoff for that change. MODE incremental against its Baseline. The iteration folder **is** the
  delta — never diff two snapshots.

## README fields

Every iteration folder has a `README.md` holding one table:

| Field | Value |
| --- | --- |
| Type | `launch`, `feat`, `change` or `fix` |
| Topic | the kebab-case topic; `—` for launch |
| Owner | the person driving it (`git config user.name`) |
| Opened | `YYYY-MM-DD` |
| Branch | the branch it is built on |
| Baseline | `none` (launch only) or the iteration it builds on |
| Status | `planning`, `ready-for-approval`, `approved`, `implementing`, `done` or `frozen` |
| Summary | one line on what it changes |

Below the table, a `## History` list records every Status change, one line each:
`- <date> · <from> → <to> · <reason or —> · <git user.name>`. `pnpm iteration:status` writes both
the Status row and the History line — never edit them by hand.

## Baseline

- Baseline is the latest iteration on `main` when the iteration was opened: the most recent Opened
  date, and on a tie the one whose last commit on `main` is newest (merge order).
  `pnpm iteration:new` fills it in. While `main` holds no iteration yet, it falls back to the latest
  iteration on the current branch and says so.
- Parallel branches are fine. Before merging, if newer iterations reached `main` meanwhile, update
  Baseline to the newest one and check overlap — the same entity, route or screen changed by both —
  and resolve it in review.

## Lifecycle

- Status moves one step at a time with `pnpm iteration:status <iteration> <status>`:
  `planning` → `ready-for-approval` → `approved` → `implementing` → `done` → `frozen`.
  `ready-for-approval`, `approved` or `implementing` may go back to `planning` with
  `--reason "<why>"`; nothing else is allowed. clinozy-fe uses the same rules without
  `ready-for-approval` (it plans no requirements):

  | Status | Set by | When |
  | --- | --- | --- |
  | `planning` | `pnpm iteration:new` | the folder is opened |
  | `ready-for-approval` | be-iteration-planning | its self-check passes (Step 5) |
  | `approved` | the user's go-ahead | logged in `plans/decisions.md` |
  | `implementing` | be-kickoff-iteration | the user confirms `KICKOFF.md` |
  | `done` | the build | every ledger row is closed and `plans/acceptance.md` is filled |
  | `frozen` | the last commit before the merge | the iteration merges to `main` |

- An iteration is frozen once it merges to `main`. Never edit a merged iteration; a correction is a
  new `fix` iteration.
- The current full picture is the launch plus every merged iteration, in merge order.

## Contents (clinozy-be)

| Path | Launch | Later iterations |
| --- | --- | --- |
| `README.md` | the field table | the field table |
| `PRD.md` | the full PRD | a feature PRD for the changed screens, flows and data |
| `schema-routes.md` | the full data model and route map | the same, scoped to the changed screens |
| `plans/` | requirements for the whole product | requirements for this change only |
| `KICKOFF.md` | the technical plan and its ledger | the same, for this change only |

`plans/` is written by **be-iteration-planning** — requirements only, never technical design:

| Path | Holds |
| --- | --- |
| `plans/product-plan.md` | goal, in / out of scope, the feature list and its order, open AMBER items, definition of done |
| `plans/coverage.md` | one row per PRD and schema-routes item, the PRD ↔ schema-routes reconciliation, overlaps |
| `plans/decisions.md` | the add-only decision log (RED, AMBER, TECH) |
| `plans/requirements/*.md` | data (with Mermaid diagrams), access, operations, background, notifications, realtime, integrations, files, quality |
| `plans/features/<feature>/story.md` | stories, rules, acceptance criteria and work items per feature |
| `plans/acceptance.md` | every acceptance criterion, with its result and evidence after the build |

`KICKOFF.md` is written by **be-kickoff-iteration** after the approval: schema first, contracts,
build order, work items with their drivers, verification, and the ledger.

- `schema-routes.md` comes from Claude Design (`docs/design-workflow/prompts/schema-routes-prompt.md`
  in clinozy-fe) and is copied here byte-for-byte from the clinozy-fe folder of the same name.
- No digit prefixes on file names — the order lives in `plans/product-plan.md` and the ledger.
- A NEW table is built with the [staged-build prompt](../docs/getting-started/staged-build-prompt.md);
  a CHANGE table, a flow or an async piece with `/be-build-requirement` — `KICKOFF.md` names the
  driver per ledger row.

clinozy-fe holds the design side of the same iteration (prototype, screen specs, `KICKOFF.md`)
under the same folder name.

## Commands

```bash
pnpm iteration:new launch
pnpm iteration:new feat pharmacy-returns
pnpm iteration:new fix invoice-rounding --both
pnpm iteration:new change patient-consent --both --sibling ../clinozy-fe --dry-run
pnpm iteration:status feat-pharmacy-returns-2026-10-06-kqzx ready-for-approval
pnpm iteration:status feat-pharmacy-returns-2026-10-06-kqzx planning --reason "scope changed"
pnpm iteration:list
```

`pnpm iteration:list` prints Name, Type, Owner, Opened, Baseline, Status and **schema-routes** — the
first 12 characters of the sha256 of the iteration's `schema-routes.md`. The same file sits in the
same-named clinozy-fe folder, so equal values in both repositories' lists mean the copies match.
