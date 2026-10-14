# Clinozy API — final routes, sub-domain by sub-domain (feat-bug-report-2026-10-13-dgnx)

Started from `af62803` (= `main`) on branch `feat/bug-report`. Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md); this
iteration adds one sub-domain outside `app`, so paths are under `/api/v1` (not `/api/v1/app`).

**How to read the tables:** **Gate** is what the caller needs; **Idem** `req` = `X-Idempotency-Key`
required; `*` = required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/…`) | Paths (`/api/v1/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | User bug report | `user/sub-domains/user-bug-report/` | `users/me/bug-reports` | 1 new | user | **final (rev 1, confirmed 2026-10-13)** — [BR13](decisions.md) |

Total: **1 route added, 0 removed, 0 reshaped.**

## Code layout and tables without routes

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 1 | `auth.user_bug_reports` (NEW) | `user/sub-domains/user-bug-report/` | the user-bug-report service (`POST /users/me/bug-reports`); read by the data export ([BR11](decisions.md)) |

## Rules for every sub-domain

| # | Rule |
| --- | --- |
| K1 | Who filed a report is the verified session's person — never a body field ([BR4](decisions.md)). |
| K2 | Reports are append-only through the API; triage reads them outside the app role ([BR8](decisions.md)). |

## Connections

```text
1) WHO WRITES WHAT

   browser (clinozy-fe) ── POST /users/me/bug-reports { description, input_method, page_path, app_version }
          │                     (Authorization: Bearer — the session names the person)
          ▼
   user-bug-report service ── reads auth.users (same unit of work) ──► auth.user_bug_reports
                                                                        (user_id, reporter_name, reporter_email,
                                                                         organization_public_id, user_agent)

2) WHAT ONE ACTION SETS OFF

   file a report ─► one row; nothing else (no audit row, event, notification or job — BR9)
   account purged ─► its reports cascade away (BR10)
   data export ───► the reports are in it (BR11)
```

---

## 1. User bug report — final (rev 1, confirmed 2026-10-13)

Code: `src/domains/user/sub-domains/user-bug-report/`.

### 1.1 Decisions

[BR3](decisions.md) – [BR11](decisions.md).

### 1.2 Open questions

None.

### 1.3 Tables and relations

`auth.user_bug_reports` — [db-changes.md](db-changes.md).

### 1.4 Permissions

None — any signed-in person files their own ([BR7](decisions.md)). API keys are refused
(`requireUserScope`).

### 1.5 Common to every route

`Authorization: Bearer`; no organization needed (catalog `O` = `both`); `STRICT_AUTHED_RATE_LIMIT`.

### 1.6 Objects returned

`UserBugReport`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `bug_<21>` |
| `description` | string | as stored (trimmed) |
| `input_method` | `typed` · `voice` · `mixed` | |
| `page_path` | string · null | |
| `app_version` | string · null | |
| `user_id` | string | the reporter's `usr_…` (from the session) |
| `reporter_name` | string · null | the account's name at the time ([BR5](decisions.md)) |
| `organization_id` | string · null | the workspace's `org_…` from the token's claim |
| `created_at` | string | ISO 8601 |

`reporter_email` and `user_agent` are stored for triage and not echoed back.

### 1.7 Routes

| # | Method | Path | Gate | Idem | Success | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | POST | `/users/me/bug-reports` | signed in |  | 200 | File a bug report |

### 1.8 Request details

| Field | Type | Rules |
| --- | --- | --- |
| `description`* | string | trimmed; 1–5000 characters |
| `input_method`* | `typed` · `voice` · `mixed` | |
| `page_path` | string · null | starts with `/`; ≤ 2048 |
| `app_version` | string · null | ≤ 64 |

The body is strict: any other field — `user_id`, `name`, `email` included — is a `400`.

### 1.9 Errors

| Status | When |
| --- | --- |
| 400 | blank, missing or too-long `description`; unknown `input_method`; bad `page_path`; an extra field |
| 401 | no session, or an API key |
| 429 | more than 10 reports a minute from the person |

### 1.10 Rules worth knowing

- The reporter's id, name and email are read from their account in the same unit of work as the
  insert — one pooled checkout.
- The `User-Agent` header is stored truncated to 512 characters.

### 1.11 Code changes

New sub-domain (controller, service, repository, dto, validator, serializer, types, constants,
schema, seed, overview, tests); one migration; the user container and routes; the data export's
payload; the route catalog and its maps; OpenAPI schema and response maps; English and Spanish
validation keys; RLS registries.

### 1.12 Nested sub-domains

None.
