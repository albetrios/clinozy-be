# feat-approximate-age-2026-10-31-kayj — as built

Baseline: none · KICKOFF.md approved 2026-10-31 ([AA12](plans/decisions.md)) · branch `feat/approximate-age`

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — `app.contacts.date_of_birth_is_approximate` + CHECK (AGC1) | `contacts.schema.ts` gains `date_of_birth_is_approximate` (boolean, NOT NULL, default false) and `chk_contacts_date_of_birth_approximate`; migration `20261031040602_contacts_date_of_birth_is_approximate.sql` (ADD COLUMN with a constant default; the CHECK `NOT VALID` then `VALIDATE`); `docs/database/clinozy-be.dbml` regenerated. RLS unchanged (FORCE RLS organization policy on `app.contacts`); no index. **Verified:** `pnpm db:migrate` locally, `pnpm db:migrate:lint` 0 violations | — | — | AA2, AA7, AA9 | (this commit) |
| #2 | ROUTE 2 — `age` in, `age` + flag out (AGC2, AGC3) | **DTO:** `age` (0–120 integer, `CONTACT_AGE_MIN`/`MAX`) on create and update, refused with `date_of_birth` (`errors:validation.contactAgeOrDateOfBirth`, en + es). **Rules:** `applyTypedAge` in `prepareCreate`/`prepareUpdate` — the organization's today − `age` years (`subtractYearsFromCalendarDate`, clamped to the database's today), flag true; a sent `date_of_birth` → flag false; `age` never stored. `decorate` sets `age` (`wholeYearsBetweenCalendarDates` to the organization's today). Serializer/types gain both fields; the preview view moved to `previewContact` ([AA15](plans/decisions.md)). **Docs:** route descriptions (create, update, list), OpenAPI `contactSchema` + example, the 7 captured Contact examples (`age: null`, flag false — by hand, as payment-celebration PC11), `contacts.overview.md`. **Tests:** `contacts-age.integration.test.ts` (4), `contacts.validator.unit.test.ts` (+3), `record-fields.calendar-years.unit.test.ts` (5) | a refused `age` reports `body.age` | the route schema refuses first | AA3, AA6, AA8, AA14 | (this commit) |
| #3 | ROUTE 3 — age filters (AGC2, AGC4) | `contactAgeRangeQueryFields` (`age_from`, `age_to`) spread into the contacts, patients and leads list queries (their exports share them); `readContactAgeRange` → derived filter `age`; `contactAgeCondition` (`date <= today − from years`, `date > today − (to + 1) years`, `organizationTodaySql`) and `contactLinkedAgeCondition` (an `IN` over the organization's contacts) in `contacts.repository.ts`, used by the three repositories; descriptions and TSDoc. **Tests:** the age integration suite's two list cases | names `age_from`/`age_to`, not `age_min`/`age_max` | the repository's range naming | AA4, AA5 | (this commit) |
| #4 | ROUTE 4 — acceptance, the frontend route map, the gates | `plans/acceptance.md` A-1 – A-5 pass, A-6 not built; `plans/frontend-route-map.md` (§§ 1, 2, 4 by hand; § 3 generated, 449 routes). **Gates:** `pnpm validate` ✓ (one pre-existing Biome warning in `release-deploy.policy.unit.test.ts`); `pnpm tsdoc:check` 0/0 ✓; `pnpm routes:catalog:check` ✓; `pnpm docs:check` ✓; `pnpm db:migrate:lint` ✓; `pnpm validate:domain` ✓; contacts (9 files, 51 tests), patients and leads suites ✓; `pnpm test:global` 142/142 ✓; `pnpm test:unit` 760 files / 6374 tests ✓ | the frontend (A-6) not built | clinozy-fe could not be attached | AA10 | (this commit) |

## Revisions to upcoming rows

- none — no scope change.

## Summary

- Planned, not built: the clinozy-fe screens (A-6, [AA10](plans/decisions.md)).
- Built, not planned: `previewContact` extracted ([AA15](plans/decisions.md)).

## Standing deviations

The complete list of where the code differs from the brief — Baseline `none`, so no list to carry.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
| Age filter names | `age_min` / `age_max` (e.g.) | `age_from` / `age_to` | this one | [AA4](plans/decisions.md) |
