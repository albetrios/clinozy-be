# Frontend route map — feat-bug-report-2026-10-13-dgnx

For the frontend: what changed in the API for this iteration, each operation's route, the routes
this iteration touches, and the design features the backend dropped.

Section 3 lists only the routes this iteration touches (the precedent of
`change-cookie-consent-2026-10-13-fmal` CC11/CC12); the tool's full generated catalog (440 routes)
was trimmed — `docs/routes.txt` is the complete list.

## 1. What changes on every call

**None.** One route is added; no existing route, body, status, header or permission changed.

| Route | Field(s) | Before | After |
| --- | --- | --- | --- |
| `POST /users/me/bug-reports` | body `description`, `input_method`, `page_path`, `app_version` | — (the browser posted to Sentry's feedback endpoint) | the panel's report; the reporter's id, name and email are **not** sent — the session names them and the backend stamps them ([BR4](decisions.md)); the body is strict |
| `POST /users/me/data-export` (the file) | `bug_reports` | — | the person's reports (description, input method, page, version, time) ([BR11](decisions.md)) |

## 2. Each operation → its route

No design drop: the operations come from the request ([BR1](decisions.md)).

| Operation | Route(s) today | Notes |
| --- | --- | --- |
| Send a bug report (typed, dictated or both) | `POST /users/me/bug-reports` | `{ description, input_method: typed \| voice \| mixed, page_path, app_version }`; `200` with the stored report (`id`, `user_id`, `reporter_name`, `organization_id`, `created_at` …); `400` on a blank description or any extra field; `429` past 10 a minute |

## 3. The routes this iteration touches

Trimmed to this iteration; the full catalog (440 routes) is `docs/routes.txt`.
**Gate**: `signed in` or a token. **#**: the route review number (`routes-final.md` § 1.7). Success
is `200`.

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/users/me/bug-reports` | signed in |  |  | 1.1 | Report a bug |
| POST | `/users/me/data-export` | signed in |  |  |  | Request GDPR data export |
| GET | `/users/me/data-export/:data_export_id` | signed in |  |  |  | Get GDPR data export status |

## 4. In the design, dropped — remove from the frontend

- Sentry's feedback widget (`feedbackIntegration`: Name, Email, Description, Add a screenshot): the
  report is the app's own and goes to `POST /users/me/bug-reports`; name and email come from the
  session; there is no screenshot ([BR6](decisions.md), clinozy-fe D3/D4).
