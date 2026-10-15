# change-natural-contact-search-2026-10-15-ozbi — kickoff

## 1. Header

| Field     | Value                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Iteration | `change-natural-contact-search-2026-10-15-ozbi`                                                         |
| Type      | change                                                                                                  |
| Baseline  | none ([NS3](plans/decisions.md))                                                                        |
| Intake    | none, no comparison ([NS3](plans/decisions.md))                                                         |
| Branch    | `feat/natural-contact-search` ([NS2](plans/decisions.md))                                               |
| Sibling   | clinozy-fe `change-natural-contact-search-2026-10-15-ozbi` (same name) — the picker that uses it ([NS2](plans/decisions.md)) |

## 2. Goal and scope

The front desk types what it has: a first name and part of the number, a surname then a first name, a
number with spaces. The contact search reads the whole text as one phrase, so "iyer meera" or "Meera
98250" find nobody — and the picker then offers to create the person again, a duplicate contact. This
iteration makes the search find a person when **every word typed** is anywhere in what it already
reads (names, email, Instagram, the contact number, every live number's ten digits), in any order
([NS1](plans/decisions.md)).

In scope:

- `buildSearchCondition` (`src/shared/utils/http/list-query.util.ts`) gains `everyWord`: each word
  in some column, AND-combined; `BaseRecordRepository` gains the `searchEveryWord` config flag; the
  contacts repository turns it on ([NS5](plans/decisions.md)).
- `contactLinkedSearchCondition` matches every word, so Leads (L7), Appointments (6.8) and Patients
  (P9) find their records the same way.
- The contact search's text reads each number run as digits ([NS6](plans/decisions.md)), in the
  contact search and the contact-linked search.
- The best match: the whole text, then the first word ([NS7](plans/decisions.md)).
- The route descriptions of the four lists; [plans/route-changes.md](plans/route-changes.md).
- Tests: the validator's reading (unit), the word rule (unit), and the four routes (integration).

Out of scope: the frontend (its own iteration); every other list's search; misspellings; a new index.

## 3. ROUTE

| #   | Work item                                                                                                              | Kind  | Depends on | Skill/driver                                          | Acceptance    | Assignee | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ----------------------------------------------------- | ------------- | -------- | ------ |
| 1   | `buildSearchCondition` `everyWord` + `searchEveryWord`; contacts on it; `contactLinkedSearchCondition` on it; number runs read as digits; the rank | code  | —          | `/be-build-requirement`, be-change-completeness-guard | § 4 lines 1–4 | Claude   | done   |
| 2   | Tests: validator + list-query unit; contacts, leads, appointments, patients integration                                 | test  | 1          | be-test-generator                                     | § 4 lines 1–5 | Claude   | done   |
| 3   | Docs: the four route descriptions, the repository / validator TSDoc, the contacts overview; route catalog and OpenAPI checks | docs  | 1          | be-route-schema-doc-guard, be-docs-maintainer         | § 4 line 6    | Claude   | done   |

No database, route-shape or background-work changes.

## 4. Definition of done

1. `GET /app/contacts?q=` with `iyer meera`, `mee iy`, `Meera 98250` and `+91 98250-11241 meera` finds
   Meera Iyer (+91 98250 11241); `meera 11111` does not.
2. A one-word search, a number alone, `C-n`, `#n` and `PT-n` read as before; the existing contact,
   lead, patient and appointment suites pass unchanged.
3. `GET /app/leads`, `/app/appointments` and `/app/patients` find their records by a reversed
   two-word name.
4. The best match ranks first for a two-word search.
5. `pnpm lint`, `typecheck`, `test:unit` and the contacts, leads, appointments and patients
   integration suites pass; `pnpm test:global`.
6. `tsdoc:check`, `routes:catalog:check`, `docs:check`, `validate:route-schema-docs`,
   `validate:domain` pass.
