# KICKOFF — change-shell-polish-and-sign-in-2026-10-13-ojjp

> The plan and the ROUTE ledger for the backend half of a frontend-led change. Frozen at approval:
> afterwards only the ROUTE Status column and "revised → AS-BUILT #n" markers change.

## 1. Header

| Field         | Value                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Iteration     | `change-shell-polish-and-sign-in-2026-10-13-ojjp`                           |
| Mode          | incremental                                                                 |
| Baseline      | `launch-2026-09-30-jxmr` ([D2](plans/decisions.md))                         |
| Intake mode   | brief                                                                       |
| Intake note   | 1 received (BRIEF.md) · 22 carried forward from launch-2026-09-30-jxmr      |
| Drop placed   | 2026-10-13                                                                  |
| Intake hash   | bc5d68b3628f                                                                |
| Schema-routes | 5f90325208e1 (unchanged)                                                    |
| Date          | 2026-10-13                                                                  |
| Route review  | [plans/routes-final.md](plans/routes-final.md) — no sub-domain in scope ([D8](plans/decisions.md)) |

## 2. Goal and scope

**Goal.** Ship the brief's four frontend changes — a room switch without a scrollbar flash, tabs that
keep their place, soft picked badges, and a marketing-led sign-in screen (`BRIEF.md:5–34`) — with the
backend contract held exactly as it is, and prove it.

**In scope:** confirming that no route, table, job, seed or permission changes
([D5](plans/decisions.md)); the frontend route map for this iteration; the backend's gates.

**Out of scope:** a public "product facts" route for the sign-in copy ([D6](plans/decisions.md)); a
demo-clinic seed ([D7](plans/decisions.md)); everything in `BRIEF.md:88–93`.

How the two repositories share the iteration:

```text
                         BRIEF.md (byte-identical · Intake hash bc5d68b3628f in both)
                                          │
              ┌───────────────────────────┴───────────────────────────┐
              ▼                                                       ▼
 clinozy-fe · change-shell-polish-…-ojjp                clinozy-be · change-shell-polish-…-ojjp
 ─────────────────────────────────────                  ─────────────────────────────────────
 L-1  tone edge tokens + TONE_CLASSES                   R-1  contract check — routes.txt and the
 L-2  room frame clips while the rise plays                  OpenAPI document unchanged; the
 L-3  WeightStableLabel                                      frontend's drift check passes
 L-4  header + phone tab labels                         R-2  frontend route map (§1, §2, §4 by
 L-5  RoomViewTabs card / plain                              hand; §3 generated)
 L-6  picked chips (DrawerChips …)                      R-3  close — gates, pre-merge review,
 L-7  picked badges elsewhere                                acceptance, AS-BUILT, done
 L-8  sign-in copy, 11 locales                                          │
 L-9  sign-in showcase + split AuthLayout                               │
 L-10 docs · L-11 verify · L-12 gates · L-13 close                      │
              │                                                         │
              └──────── calls only KEPT routes (route-changes.md) ◄─────┘
                                          │
                                          ▼
                 two branches · claude/determined-rubin-c9i935 · no PR until the user confirms (D1)
```

## 3. Locked decisions

1. [D1](plans/decisions.md) — Run on the recommendations; approve, build and close by delegation; no PR until the user confirms.
2. [D2](plans/decisions.md) — Baseline `launch-2026-09-30-jxmr`.
3. [D3](plans/decisions.md) — Intake mode `brief`.
4. [D4](plans/decisions.md) — Branch `claude/determined-rubin-c9i935`.
5. [D5](plans/decisions.md) — The backend changes nothing: no route, table, job, seed or permission.
6. [D6](plans/decisions.md) — No public route for marketing copy; the copy is the frontend's, static.
7. [D7](plans/decisions.md) — No demo-clinic seed in this iteration.
8. [D8](plans/decisions.md) — The route review is empty.
9. [D9](plans/decisions.md) — Approved by delegation.

## 4. Features and order

1. [sign-in-and-shell-polish](plans/features/sign-in-and-shell-polish/story.md) — flow; depends on none.

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-1 | Contract check: `pnpm routes:catalog:check`, `pnpm docs:check` and the frontend's `pnpm contracts:drift` against this branch — every route the sign-in screen and the shell call is `KEPT` ([route-changes.md](plans/route-changes.md)) | flow | — | be-route-catalog · be-api-contract-guard (check only) | A1, A2 | Claude | done |
| R-2 | Frontend route map: `plans/frontend-route-map.md` — §1 "none", §2 the sign-in and shell operations → their routes, §3 by `pnpm iteration:frontend-map`, §4 "none" | flow | R-1 | `pnpm iteration:frontend-map` | `pnpm iteration:frontend-map <it> --check` | Claude | done |
| R-3 | Close: `pnpm validate`, `pnpm routes:catalog:check`, `pnpm iteration:intake <it> --check`, `/be-pre-merge-review` (review only), `plans/acceptance.md`, `AS-BUILT.md` (rows, summary, Standing deviations), Status `done` | flow | R-1, R-2, the frontend iteration's L-13 | be-kickoff-iteration | A3, A4; README Status `done` | Claude | done |

No `sub-domain`, `table` or `background` row: nothing is built here ([D5](plans/decisions.md)).

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.none` | [requirements/data.md](plans/requirements/data.md) |
| `quality.contract-unchanged` | [requirements/quality.md](plans/requirements/quality.md) |

`access`, `operations`, `background`, `notifications`, `realtime`, `integrations`, `files`: n/a (each
file says why).

## 7. Open AMBER items

None in this repository. (The frontend's D13 — a native read of the 10 new translations — is the
frontend's.)

## 8. Standing deviations

The Baseline's backend Standing deviations are untouched: this iteration changes no backend behaviour.
The frontend iteration records the two it changes (the sign-in surface, the drawer chips' picked edge).

## 9. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; `AS-BUILT.md` with its summary and the Standing
deviations (copied from the Baseline, unchanged); the repository's gates green; README Status `done`.
`frozen` is set in the last commit before the merge, after the user confirms the PRs (D1).

## 10. Verification

Intake mode `brief`: the `BRIEF.md` acceptance criteria — the backend proves A1, A2 and A4; A3
(criteria 1–10) is proved by the frontend iteration and cited here. MODE incremental: no backend code
changes, so the existing end-to-end suites are unaffected; the gates (`pnpm validate`,
`pnpm routes:catalog:check`, `pnpm docs:check`) confirm it.
