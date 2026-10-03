# Quality — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: audit, privacy, retention, limits, safe retries. Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `quality.tenant-isolation` | NEW | No clinic can read or change another clinic's records, including from background work | CLAUDE.md › Organization context; C3 | [shell-and-patterns](../features/shell-and-patterns/story.md) |
| `quality.audit` | CHANGED | Changes to clinic roles and access, and money reversals, are kept in the organization's audit log | C13; Appendix F (Q-U6) | [team-and-access](../features/team-and-access/story.md) |
| `quality.safe-retry` | NEW | Every create and every money-moving action is safe to retry and records once | C12; H:2354; _patterns.md:274 | [shell-and-patterns](../features/shell-and-patterns/story.md) |
| `quality.limits` | NEW | Text limits are the longer of the screen's and schema-routes'; lists page by 50 | P37, D40; schema-routes.md:1540 | [shell-and-patterns](../features/shell-and-patterns/story.md) |
| `quality.privacy` | NEW | Patient data sent outside is de-identified (AI, D39); phones are masked in the command search; photo location data is removed | D39; _patterns.md:203; WC-42 | [patient-file](../features/patient-file/story.md) |
| `quality.retention` | NEW | Deleted records are purged after the clinic's window (default 7 days) — to be confirmed with the clinic's advisor against medical-record rules | D38 | [shell-and-patterns](../features/shell-and-patterns/story.md) |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `quality.audit` | the audit log covers platform actions | it also covers clinic role and access changes and money reversals | C13, Appendix F |
