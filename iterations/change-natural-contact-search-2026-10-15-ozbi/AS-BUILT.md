# change-natural-contact-search-2026-10-15-ozbi — as built

Baseline: none · KICKOFF.md approved 2026-10-15 ([NS4](plans/decisions.md))

## Rows

| #   | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1  | ROUTE 1 — the word rule, number runs, the rank | `buildSearchCondition` (`list-query.util.ts`) takes `everyWord`: each whitespace word in some column, AND-combined (a one-word `q` builds the same single condition as before); `searchWords` splits a search. `BaseRecordTableConfig.searchEveryWord` passes it; the contacts repository sets it, and `contactLinkedSearchCondition` builds its subquery condition with it (Leads L7, Appointments 6.8, Patients P9). `contacts.validator.ts` reads each number run inside a text as digits through the existing `phoneQueryDigits` (`searchTextOf`), in the contact search and the contact-linked search. `matchRank`: 0 the whole text at the name's start or in the primary number; 1 the first word at the name's start or a word's start; 2 the rest | `containsInAnyColumn` takes an options object | The `object-params` global policy (`be-object-params.mdc`) | NS5–NS7 | (this commit) |
| #2  | ROUTE 2 — tests | Unit: `list-query.util.unit.test.ts` (phrase vs every word, one word either way, `searchWords`), `contacts.validator.unit.test.ts` (number runs in a text, both readers). Integration: `contacts` (reversed, parts, name + part of the number, a typed `+91 …-…` number then the name, one word missing → nobody), `leads`, `appointments`, `patients` (a reversed two-word name). On the code before this change the four new contact checks fail (`expected '' to be 'Meera'`) | none | — | NS1 | (this commit) |
| #3  | ROUTE 3 — docs | The `GET /app/contacts`, `/app/leads`, `/app/appointments` and `/app/patients` descriptions say "every word, in any order"; the repository / validator / util TSDoc; `contacts.overview.md` § One search | none | — | NS5 | (this commit) |

## Summary

- **Built:** a contact search that matches every typed word, in any order, names and numbers
  together; the same in the Leads, Appointments and Patients lists' contact search. Verified on the
  running API against the demo clinic: "rana amrita", "amr ran", "Amrita 77471" and
  "+91 77471-48810 amrita" find Amrita Rana; "amrita 11111" finds nobody.
- **Planned, not built:** none. **Built, not planned:** none.
- **Definition of done (`KICKOFF.md` § 4):**
  1. ✓ (integration, and the running API)
  2. ✓ — contacts, leads, appointments and patients suites pass; `test:unit` (688 files, 5,397
     tests)
  3. ✓
  4. ✓ — the rank's first-word rule; a one-word search ranks as before
  5. ✓ `lint`, `typecheck`, `test:unit`, the four integration suites, `test:global` (34 files, 142
     tests — `object-params` caught the first draft's two positional parameters, fixed)
  6. ✓ `tsdoc:check` (0 / 0), `routes:catalog:check`, `docs:check`, `validate:route-schema-docs`,
     `validate:domain`
- **Open:** NS8 (AMBER) — the minimum stays on the whole text (3 characters), so "meera i" searches.

## Standing deviations

None carried (Baseline `none`), none added: the change follows its brief (`KICKOFF.md` § 2).
