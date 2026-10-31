# feat-approximate-age-2026-10-31-kayj — acceptance

One row per acceptance criterion of `intake-files/BRIEF.md`. Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 `POST /app/contacts` with `age: 34` stores today − 34 years, answers `age: 34`, `date_of_birth_is_approximate: true` | `BRIEF.md` Acceptance 1 | pass | `contacts-age.integration.test.ts` — Asha `age: 34` → `date_of_birth` today − 34 y, `age` 34, approximate true; `record-fields.calendar-years.unit.test.ts` (5/5) — [AS-BUILT #2](../AS-BUILT.md) |
| A-2 `PATCH` with `date_of_birth` turns the flag off; with `age` on; `null` clears both | Acceptance 2 | pass | `contacts-age.integration.test.ts` — Chitra `age 25` → approximate; `null` → both cleared; Dina `age 60` → on, a real date → off — [AS-BUILT #2](../AS-BUILT.md) |
| A-3 `age` + `date_of_birth` → 400; `age` outside 0–120 or not whole → 400 | Acceptance 3 | pass | `contacts-age.integration.test.ts` (both, 121, 3.5 → 400 `body.age`; PATCH both → 400) and `contacts.validator.unit.test.ts` (14/14) — [AS-BUILT #2](../AS-BUILT.md) |
| A-4 Every Contact response carries `age` and `date_of_birth_is_approximate` | Acceptance 4 | pass | `contacts-age.integration.test.ts` — create, update, read, list and preview carry `age` and the flag; the OpenAPI `contactSchema` and example name both (`pnpm docs:check`) — [AS-BUILT #2](../AS-BUILT.md) |
| A-5 Contacts, patients and leads lists filter by an age range, real and approximate alike | Acceptance 5 | pass | `contacts-age.integration.test.ts` — contacts 30–40 → Asha (approx.), Bina (real); exactly 60; empty range; 400s; patients ≤ 35 / ≥ 36 and leads = 40 / ≥ 50 by their contact — [AS-BUILT #3](../AS-BUILT.md) |
| A-6 Frontend form, "34 y · approx.", list filters | Acceptance 6 | not built | clinozy-fe could not be attached to this session ([AA10](decisions.md)); `plans/frontend-route-map.md` §§ 1–2 hand the routes to the clinozy-fe iteration |
