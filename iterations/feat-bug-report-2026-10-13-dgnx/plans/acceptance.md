# feat-bug-report-2026-10-13-dgnx — acceptance

One row per acceptance criterion the backend owns (`KICKOFF.md` § 2, § 10); the screen's are
clinozy-fe's ([BR12](decisions.md)).

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 A signed-in person files a report; it is stored with their id, name and email stamped from the session, the workspace from the token, the user agent and the time | the request; BR4–BR6 | pass | `user-bug-report.integration.test.ts` (stores + stamps; workspace recorded) · `user-bug-report.service.unit.test.ts` — [AS-BUILT #1](../AS-BUILT.md) |
| A-2 A body naming a reporter (`user_id`, `name`, `email`) is refused and nothing is stored | BR4 | pass | `user-bug-report.integration.test.ts` (400, no row for either user) · `user-bug-report.validator.unit.test.ts` — [AS-BUILT #1](../AS-BUILT.md) |
| A-3 A blank or too-long description, an unknown input method or a non-path page is a 400; signed out is a 401 | BR6, BR7 | pass | `user-bug-report.integration.test.ts` · `user-bug-report.validator.unit.test.ts` — [AS-BUILT #1](../AS-BUILT.md) |
| A-4 An account with no name yet stores `reporter_name` null and still its email | BR5 | pass | `user-bug-report.integration.test.ts` · `user-bug-report.serializer.unit.test.ts` — [AS-BUILT #1](../AS-BUILT.md) |
| A-5 One person cannot read or write another's report through the app role (FORCE RLS, owner policy) | BR8 | pass | `rls-matrix.security.test.ts` (user-scoped table) · `rls-table-scope-map.db.unit.test.ts` · the route suite under `pnpm test:rls-role` — [AS-BUILT #1](../AS-BUILT.md) |
| A-6 The person's data export carries their reports, capped like every category | BR11 | pass | `user-data-export.service.payload.unit.test.ts` (mapping + cap) · the export integration suite under `pnpm test:rls-role` — [AS-BUILT #2](../AS-BUILT.md) |
