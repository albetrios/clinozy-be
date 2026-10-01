# Design iterations

An iteration is one product/design change, recorded as a folder under `iterations/`. It is a
product/design iteration, **not** an app release — releases are the `package.json` version and
`CHANGELOG.md`.

Open one with `pnpm iteration:new`; list them with `pnpm iteration:list`. There is no shared index
file — each iteration describes itself in its own `README.md`.

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
  changed screens, flows and data, a `schema-routes.md` scoped to the changed screens, and plans for
  the new or changed tables. MODE incremental against its Baseline. The iteration folder **is** the
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
| Status | `planning`, `building` or `frozen` |
| Summary | one line on what it changes |

## Baseline

- Baseline is the latest iteration on `main` when the iteration was opened: the most recent Opened
  date, and on a tie the one whose last commit on `main` is newest (merge order).
  `pnpm iteration:new` fills it in. While `main` holds no iteration yet, it falls back to the latest
  iteration on the current branch and says so.
- Parallel branches are fine. Before merging, if newer iterations reached `main` meanwhile, update
  Baseline to the newest one and check overlap — the same entity, route or screen changed by both —
  and resolve it in review.

## Lifecycle

- Status moves `planning` → `building` → `frozen`.
- An iteration is frozen once it merges to `main`. Never edit a merged iteration; a correction is a
  new `fix` iteration.
- The current full picture is the launch plus every merged iteration, in merge order.

## Contents (clinozy-be)

| Path | Launch | Later iterations |
| --- | --- | --- |
| `README.md` | the field table | the field table |
| `PRD.md` | the full PRD | a feature PRD for the changed screens, flows and data |
| `schema-routes.md` | the full data model and route map | the same, scoped to the changed screens |
| `plans/product-plan.md` | the product plan, with build order | this change only, with build order |
| `plans/<table>.md` | one per table | one per new or changed table |

- `schema-routes.md` comes from Claude Design (`docs/design-workflow/prompts/schema-routes-prompt.md`
  in clinozy-fe) and is copied here byte-for-byte from the clinozy-fe folder of the same name.
- Every `plans/<table>.md` starts with its Status.
- No digit prefixes on file names — the build order lives in `plans/product-plan.md`.
- Build each table with the [staged-build prompt](../docs/getting-started/staged-build-prompt.md).

clinozy-fe holds the design side of the same iteration (prototype, screen specs, `KICKOFF.md`)
under the same folder name.

## Commands

```bash
pnpm iteration:new launch
pnpm iteration:new feat pharmacy-returns
pnpm iteration:new fix invoice-rounding --both
pnpm iteration:new change patient-consent --both --sibling ../clinozy-fe --dry-run
pnpm iteration:list
```
