# Clinozy API — final routes, sub-domain by sub-domain (change-cookie-consent-2026-10-13-fmal)

Started from `claude/inspiring-heisenberg-4v5ttl` at `c3822a0` (= `main`). Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md); this
iteration touches one sub-domain outside `app`, so paths are under `/api/v1` (not `/api/v1/app`).

**How to read the tables:** `{x_id}` is a public id; **Gate** is what the caller needs; **Idem** `req`
= `X-Idempotency-Key` required; `*` = required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/…`) | Paths (`/api/v1/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | User settings — the consent receipt | `user/sub-domains/user-settings/` | `users/me/settings` (+ `auth/logout`, pinned) | 2 documented anew, 1 pinned, 0 new | user, auth, audit | **final (rev 1, confirmed 2026-10-13)** — [CC8](decisions.md) |

Total: **0 routes added, 0 removed, 0 reshaped** — the two settings routes are documented as a
receipt; sign-out is pinned by a test. `docs/routes.txt` stays at its current count.

## Code layout and tables without routes

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 1 | `auth.user_settings` (unchanged) | `user/sub-domains/user-settings/` | the user-settings service (`PATCH /users/me/settings`) |

## Rules for every sub-domain

| # | Rule |
| --- | --- |
| K1 | The browser owns the analytics answer (a first-party cookie the frontend writes); the backend never reads, sets or clears it ([CC1](decisions.md)). |
| K2 | A consent receipt is written only by the signed-in person, for their own settings, while signed in ([CC3](decisions.md)). |

## Connections

```text
1) WHO WRITES WHAT

   browser (clinozy-fe) ── cookie clinozy-consent-preferences ──► decides what runs (PostHog, Sentry replay)
          │
          └─ signed in, on a new answer ─► PATCH /users/me/settings ─► auth.user_settings (receipt)
                                                                   └─► audit outbox (user.settings.analytics_consent.update)

2) WHAT ONE ACTION SETS OFF

   answer while signed in ─► receipt + audit row (same request)
   answer while signed out ─► nothing on the server
   sign-in ────────────────► nothing about consent (never copied either way)
   sign-out ───────────────► session revoked; receipt untouched; no consent cookie, no Clear-Site-Data
```

---

## 1. User settings — the consent receipt — final (rev 1, confirmed 2026-10-13)

Code: `src/domains/user/sub-domains/user-settings/` (and the user controller's audit helper,
`src/domains/user/user.controller.ts`). Reads `intake-files/BRIEF.md` (lines 27–44, 78–79, 97–100,
108) and the Baseline's D85.

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to
every route · 1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules
worth knowing · 1.11 Code changes · 1.12 Nested sub-domains.

### 1.1 Decisions (whole sub-domain)

Taken on the user's standing answer "go ahead with your recommendation".

| # | Decision |
| --- | --- |
| US1 | **A receipt, not the source.** Today the three fields are "the person's consent", read by the frontend at sign-in (D85). After: "the last analytics answer given while signed in — a receipt"; the frontend writes it and never reads it back ([CC1](decisions.md)). Other option: drop the fields (loses the proof). |
| US2 | **Shape unchanged.** Today `PATCH` takes `analytics_consent` (`granted` / `denied`) with `analytics_consent_version` (1–1000), either alone a `400` on `analytics_consent_version`; the database stamps `analytics_consent_at`; `GET` / `PATCH` return all three. After: the same ([CC2](decisions.md)). The frontend's new notice is policy version 2 — inside the accepted range. |
| US3 | **The audit row stays the proof.** Today each decision is its own `user.settings.analytics_consent.update` row with the decision, version and time. After: the same; its catalog line in `docs/reference/security/audit-logs.md` says it records an answer given while signed in. |
| US4 | **Sign-out pinned.** Today `POST /auth/logout` revokes the session and touches no settings, but nothing pins it. After: an integration test proves the receipt survives sign-out and the response sends no consent cookie and no `Clear-Site-Data` ([CC4](decisions.md)). |

### 1.2 Open questions

None.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `auth.user_settings` | a person's settings; the consent receipt (unchanged) | one row per user; `chk_user_settings_analytics_consent` (all three null, or all set); RLS by `app.current_user_public_id` |

```text
auth.users ──o| auth.user_settings        the receipt: analytics_consent · _version · _at
audit outbox ◄── one row per decision      user.settings.analytics_consent.update
```

**PostgreSQL design:** no change — no migration.

### 1.4 Permissions

| Code | Allows | Routes | Held by default |
| --- | --- | --- | --- |
| — (authenticated self-service) | read and write one's own settings | 1, 2 | every signed-in person |
| — (the session's bearer) | sign out | 3 | every signed-in person |

### 1.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1` |
| Auth | `Authorization: Bearer <access token>` |
| Success | `200` with `{ data, meta }` |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400`, `401`, `429` (as today) |

### 1.6 Objects returned

| Object | Fields that matter here |
| --- | --- |
| User settings | `analytics_consent` (`granted` · `denied` · `null`), `analytics_consent_version` (integer or `null`), `analytics_consent_at` (ISO 8601 or `null`) — the receipt |

### 1.7 Routes

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/users/me/settings` | My settings, the receipt included **(documented anew)** | signed in | |
| 2 | PATCH | `/users/me/settings` | Change my settings; record a consent receipt **(documented anew)** | signed in | |
| 3 | POST | `/auth/logout` | Sign out — leaves the receipt **(pinned)** | the session's bearer | |

### 1.8 Request details

| # | Body | Notes |
| --- | --- | --- |
| 2 | `analytics_consent` (`granted` · `denied`) with `analytics_consent_version` (1–1000), together or not at all; any other setting alone | the time is the database's |

### 1.9 Errors

| # | Status | Reason | When |
| --- | --- | --- | --- |
| 2 | 400 | `invalid_field` on `analytics_consent_version` | the decision without its version, or the reverse (`errors:validation.analyticsConsentWithVersion`, unchanged) |

### 1.10 Rules worth knowing

- The receipt records the last answer given while signed in; the browser may hold a different,
  later answer given signed out — the browser's decides what runs (K1).
- Repeating the same answer is a new audit row — the log is the proof, the fields are the latest.

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| USC1 | US1–US3: the receipt wording in the TSDoc of `user-settings.constants.ts`, `.schema.ts`, `.types.ts`, `.dto.ts`, `.validator.ts`, `.repository.ts` and `recordAnalyticsConsentAudit`; the OpenAPI field descriptions (`tooling/openapi/enrichers/field-descriptions.ts`); `user-settings.overview.md` (the invariant); `docs/reference/security/audit-logs.md` (the action) |
| USC2 | US4: a new integration test under `src/domains/user/__tests__/integration/` — sign in, record a receipt, sign out, sign in again: the receipt is unchanged; the sign-out response has no `Clear-Site-Data` and no consent `Set-Cookie` |

### 1.12 Nested sub-domains

None.
