# feat-payment-celebration-2026-10-15-xpkw — acceptance

One row per acceptance criterion the backend owns; the others are clinozy-fe's
([PC3](decisions.md)). Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 `GET /app/branches/my` returns `review_link` on each branch to every member (`organization:read`, no `branch:read`): the saved `https://` link, or `null` when the branch has none — next to every field it returned before | `BRIEF.md:39–41`, `:121–122`; `PRD.md:21–25`; `schema-routes.md:12`, `:27` | pass | `branches.integration.test.ts` — the `/my` field list includes `review_link`; a member without `branch:read` reads `null`, the saved link, then `null` once cleared (29/29, and 29/29 as the RLS-subject role); `branches.serializer.unit.test.ts` (3/3) — [AS-BUILT #1](../AS-BUILT.md) |
| A-2 Additive and documented: no route added, removed or re-gated, no migration, same major; `PATCH /app/branches/{branch_id}` still stores the link; the OpenAPI document (description, response schema and example), the captured route example and the overview name the field | `BRIEF.md:105`; `PRD.md:24–25`, `:37–39`; `schema-routes.md:14`, `:28` | pass | `pnpm routes:catalog:check` (449 routes, unchanged), `pnpm db:migrate:lint` and no migration in the diff, `pnpm docs:check` (the `/my` description, `branchSummarySchema` and its example name `review_link`), the captured `/my` example, `branches.overview.md`; the `PATCH` case in the same test stores and clears the link — [AS-BUILT #1](../AS-BUILT.md) |
| A-3 The demo clinic's main branch carries a Google review link and its second branch none | `BRIEF.md:41–43`; [PC7](decisions.md) | pass | `demo-clinic-plan.unit.test.ts` (108/108) and `demo-clinic-seed.integration.test.ts` (2/2): the main branch carries `https://g.page/r/CQdemoclinicEAE/review`, the second `null` — [AS-BUILT #2](../AS-BUILT.md) |
