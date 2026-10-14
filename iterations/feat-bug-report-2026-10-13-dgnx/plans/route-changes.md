# feat-bug-report-2026-10-13-dgnx — route changes

Iteration `feat-bug-report-2026-10-13-dgnx` · MODE initial (Baseline `none`) · no intake files ·
2026-10-13.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Users — my bug reports | 1 | 0 | 0 |
| Users — my data export | 0 | 1 (the export's contents) | 0 |

## Users — my bug reports

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-1 | NEW | POST | `/api/v1/users/me/bug-reports` | the signed-in person (user principal), personal or team workspace; 10 a minute | file a bug report; the reporter is stamped from the session | the request; [BR3](decisions.md) – [BR7](decisions.md) | as proposed — [AS-BUILT #1](../AS-BUILT.md) |

## Users — my data export

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-2 | CHANGED — the artifact's contents | POST | `/api/v1/users/me/data-export` | unchanged | the export file gains `bug_reports` | [BR11](decisions.md) | as proposed — [AS-BUILT #2](../AS-BUILT.md) |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-1 | `POST /api/v1/users/me/bug-reports` | new route | — (the browser posted to Sentry's feedback endpoint) | body `{ description, input_method, page_path?, app_version? }` → `200 { data: { id, description, input_method, page_path, app_version, user_id, reporter_name, organization_id, created_at } }` | [BR3](decisions.md), [BR4](decisions.md), [BR6](decisions.md) |
| RC-2 | `POST /api/v1/users/me/data-export` (the artifact) | output | `user`, `organizations`, `sessions`, `notifications`, `audit_activity` | + `bug_reports` | [BR11](decisions.md) |
