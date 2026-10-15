# feat-payment-celebration-2026-10-15-xpkw — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-payment-celebration-2026-10-15-xpkw` (type `feat`, topic `payment-celebration`) |
| Mode | initial — Baseline `none` ([PC1](plans/decisions.md)) |
| Baseline | `none` |
| Intake mode | `full` |
| Intake note | 3 received |
| Drop placed | 2026-10-15 |
| Intake hash | `992289e86d52` |
| Schema-routes | `bbcd7d3a0bf1` |
| Date | 2026-10-15 |
| Branch | `feat/payment-celebration` ([PC2](plans/decisions.md) — the README's row reads `feat/motion-polish`) |
| Sibling | clinozy-fe `iterations/feat-payment-celebration-2026-10-15-xpkw/` — the Payment received view, the animation, the review ask, the Branch drawer field and the motion pass ([PC3](plans/decisions.md)) |

## 2. Goal and scope

**Goal.** A payment received becomes the moment to ask for a Google review, with the payment
branch's review link in the WhatsApp message. The backend's part: every member reads each of their
branches' review link with the branch list they already load — `GET /app/branches/my` gains
`review_link` — additively, on the same major version.

**In scope:** `review_link` on `/my` (repository, serializer, TSDoc); its documentation (the route
description, the OpenAPI response schema and example, the captured route example, the overview);
the branches tests; the demo clinic's main branch carrying a review link; acceptance and the
frontend route map.

**Out of scope:** everything on screen (clinozy-fe, [PC3](plans/decisions.md)); `maps_link` or any
other branch field on `/my` ([PC5](plans/decisions.md)); recording that a review was asked for,
delivering WhatsApp messages, a review summary on patient or payment responses (`BRIEF.md:132–136`,
`PRD.md:43–44`); any new route, table or migration ([PC6](plans/decisions.md)).

## 3. Locked decisions

- [PC1](plans/decisions.md) — Baseline `none`, Intake mode `full`; no older iteration related.
- [PC3](plans/decisions.md) — the backend builds only the `review_link` read; the rest is clinozy-fe's.
- [PC4](plans/decisions.md) — every member reads it through `GET /app/branches/my`.
- [PC5](plans/decisions.md) — `review_link` only; `/my` stays an allow-list.
- [PC6](plans/decisions.md) — additive on `v1`: the stored value or `null`; no migration, no new route.
- [PC7](plans/decisions.md) — the demo clinic's main branch has a link, its second branch none.
- [PC8](plans/decisions.md) — route review sub-domain 1 (branches) final.
- [PC9](plans/decisions.md) — approved.

## 4. Features and order

1. `branch-review-link` (flow) — [story](plans/features/branch-review-link/story.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Branches — `GET /app/branches/my` returns `review_link`: [`routes-final.md` § 1](plans/routes-final.md#1-branches--the-review-link-for-every-member--final-rev-1-confirmed-2026-10-15), code changes BRC1–BRC3 | sub-domain | — | `/be-build-requirement` (CHANGE, route-change chain: `be-api-contract-guard`, `be-route-schema-doc-guard`, `be-route-catalog`, `be-test-generator`, `be-tsdoc-export-guard`, `be-overview-doc-maintainer`) | A-1, A-2 | Claude | open |
| 2 | The demo clinic's review link: BRC4 | feature | 1 | `/be-build-requirement` (`be-seed-maintainer`, `be-test-generator`) | A-3 | Claude | open |
| 3 | Acceptance, the frontend route map and the gates | flow | 1, 2 | `be-kickoff-iteration` › Close | A-1 – A-3 | Claude | open |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.branch-review-link` | [requirements/data.md](plans/requirements/data.md) |
| `data.demo-clinic-review-link` | [requirements/data.md](plans/requirements/data.md) |
| `access.every-member-reads-review-link` | [requirements/access.md](plans/requirements/access.md) |
| `operations.read-branch-review-link` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.edit-branch-review-link` | [requirements/operations.md](plans/requirements/operations.md) |
| `quality.additive-on-v1` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.documented-and-tested` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.no-new-message` | [requirements/quality.md](plans/requirements/quality.md) |

The other requirement files (`background`, `notifications`, `realtime`, `integrations`, `files`) are
n/a — one read field, no background work, message, realtime update, outside system or file — and are
not written, as in `change-cookie-consent-2026-10-13-fmal` (its CC12).

## 7. Open AMBER items

- [PC2](plans/decisions.md) — the README's Branch row reads `feat/motion-polish` (copied from clinozy-fe by `iteration:new --both`); the backend is built on `feat/payment-celebration`.

## 8. Standing deviations

n/a — Baseline `none` ([PC1](plans/decisions.md)): there is no Baseline list to carry. This
iteration touches none of the launch's deviations (its branch rows — field names, `branch_members`,
per-resource codes — stand as built) and adds none: it builds what the drop asks for.

## 9. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; the `AS-BUILT.md` summary and Standing
deviations written; `pnpm validate`, `pnpm validate:domain`, `pnpm tsdoc:check`, `pnpm docs:check`,
`pnpm routes:catalog:check` and the touched tests green; `plans/frontend-route-map.md` written.

## 10. Verification

Intake mode `full` → the acceptance traced to `PRD.md` / `BRIEF.md` lines in `plans/acceptance.md`
(A-1 – A-3); the branches unit and integration suites, the demo clinic's plan unit and seed
integration suites; `pnpm docs:check` (the OpenAPI document), `pnpm routes:catalog:check` (no route
moved), `pnpm db:migrate:lint` (no migration), `pnpm validate`, `pnpm validate:domain`,
`pnpm tsdoc:check`.
