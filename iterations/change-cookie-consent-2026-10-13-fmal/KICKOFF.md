# change-cookie-consent-2026-10-13-fmal — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `change-cookie-consent-2026-10-13-fmal` (type `change`, topic `cookie-consent`) |
| Mode | incremental |
| Baseline | `launch-2026-09-30-jxmr` ([CC7](plans/decisions.md)) |
| Intake mode | `brief` |
| Intake note | 1 received (BRIEF.md) · 22 carried forward from launch-2026-09-30-jxmr |
| Drop placed | 2026-10-13 |
| Intake hash | `a8a0e5889cc1` |
| Schema-routes | `5f90325208e1` (unchanged from the Baseline) |
| Date | 2026-10-13 |
| Sibling | clinozy-fe `iterations/change-cookie-consent-2026-10-13-fmal/` — the card, the cookie and every screen ([CC5](plans/decisions.md)) |

## 2. Goal and scope

**Goal.** The cookie card works the claude.com way: the answer belongs to the browser, so signing
out never asks again. The backend's part is to keep the account's consent record as a **receipt**
of answers given while signed in — the proof of consent — and to pin that signing out leaves it,
with no change to the API shape or the database.

**In scope:** the receipt's documented meaning (TSDoc, OpenAPI field descriptions, the sub-domain
overview, the audit catalog); an integration test that sign-out keeps the receipt and sends no
consent cookie or `Clear-Site-Data`; acceptance and the frontend route map.

**Out of scope:** everything on screen and in the browser (clinozy-fe, [CC5](plans/decisions.md));
a Marketing category, a region check, a log for signed-out visitors, a Cookie Policy page, any API
or database change (`BRIEF.md:102–108`, [CC2](plans/decisions.md)).

## 3. Locked decisions

- [CC1](plans/decisions.md) — the browser owns the answer (claude.com); D85's "applied at sign-in" and "forgotten at sign-out" are superseded.
- [CC2](plans/decisions.md) — the account record and its audit row stay, unchanged, as a receipt.
- [CC3](plans/decisions.md) — sign-in never copies the browser's answer onto the account.
- [CC4](plans/decisions.md) — sign-out touches no consent; pinned by a test.
- [CC5](plans/decisions.md) — the frontend-only items are planned in clinozy-fe.
- [CC7](plans/decisions.md) — proceed on the launch as merged to `main`.
- [CC8](plans/decisions.md) — route review sub-domain 1 final.

## 4. Features and order

1. `consent-receipt` (flow) — [story](plans/features/consent-receipt/story.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | User settings — the consent receipt, documented as such: [`routes-final.md` § 1](plans/routes-final.md#1-user-settings--the-consent-receipt--final-rev-1-confirmed-2026-10-13), code change USC1 | sub-domain | — | `/be-build-requirement` (CHANGE, docs only: `be-tsdoc-export-guard`, `be-openapi-multilingual`, `be-overview-doc-maintainer`, `be-docs-maintainer`) | A-3 | Claude | open |
| 2 | Sign-out keeps the receipt: USC2 | flow | 1 | `/be-build-requirement` (`be-test-generator`) | A-1, A-2 | Claude | open |
| 3 | Acceptance, the frontend route map and the gates | flow | 1, 2 | `be-kickoff-iteration` › Close | A-1 – A-3 | Claude | open |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.consent-receipt` | [requirements/data.md](plans/requirements/data.md) |
| `access.own-settings-only` | [requirements/access.md](plans/requirements/access.md) |
| `operations.record-receipt` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.read-receipt` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.sign-out-keeps-receipt` | [requirements/operations.md](plans/requirements/operations.md) |
| `quality.proof-of-consent` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.receipt-errors-translated` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.no-server-consent-cookie` | [requirements/quality.md](plans/requirements/quality.md) |

## 7. Open AMBER items

- [CC6](plans/decisions.md) — built on the session's branch `claude/inspiring-heisenberg-4v5ttl`, not `change/cookie-consent`.

## 8. Standing deviations

The Baseline's backend list (`launch-2026-09-30-jxmr/AS-BUILT.md` › Standing deviations) has no
consent item — D85 was a decision beyond the drop, not a deviation from it. This iteration touches
none of the Baseline's deviations and keeps them all; it adds none (the drop says nothing about the
receipt, and the brief keeps it).

## 9. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; the `AS-BUILT.md` summary and Standing
deviations written; `pnpm validate`, the route and domain gates, `pnpm tsdoc:check` and the touched
tests green.

## 10. Verification

Intake mode `brief` → the backend's `BRIEF.md` acceptance criteria (A-1 – A-3 in
`plans/acceptance.md`); MODE incremental → the existing user-settings tests (unit + the route's
integration suite) and the sign-out suite re-run; `pnpm docs:check` (the OpenAPI document),
`pnpm routes:catalog:check` (no route moved), `pnpm validate`, `pnpm validate:domain`,
`pnpm tsdoc:check`.
