# change-cookie-consent-2026-10-13-fmal — route changes

Iteration `change-cookie-consent-2026-10-13-fmal` · MODE incremental on `launch-2026-09-30-jxmr` ·
Intake mode `brief` · Intake hash `a8a0e5889cc1` · 2026-10-13.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Users — my settings | 0 | 2 (documentation only) | 0 |
| Auth — sign-out | 0 | 0 (behavior pinned by a test) | 0 |

No route is added, removed or reshaped: methods, paths, access, request and response bodies,
statuses and idempotency stay as `docs/routes.txt` has them. What changes is what the consent fields
are documented to mean ([CC1](decisions.md), [CC2](decisions.md)).

## Users — my settings

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-1 | CHANGED — documentation of `analytics_consent*` | GET | `/api/v1/users/me/settings` | the signed-in person, their own settings | read my settings (the receipt is part of it) | `BRIEF.md:61–62` |
| RC-2 | CHANGED — documentation of `analytics_consent*` | PATCH | `/api/v1/users/me/settings` | the signed-in person, their own settings | record a consent receipt (decision + policy version) | `BRIEF.md:42–44`, `:78` |

## Auth — sign-out

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-3 | UNCHANGED — pinned | POST | `/api/v1/auth/logout` | the session's bearer | sign out: revokes the session, leaves the consent receipt and sends no consent cookie or `Clear-Site-Data` | `BRIEF.md:31–32`, `:100` |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-1 | `GET /api/v1/users/me/settings` | output (documentation) | the consent fields are "the person's answer", which the frontend applies at sign-in | the same fields are "the last answer given while signed in — a receipt"; the frontend no longer reads them for the card | CC1 |
| RC-2 | `PATCH /api/v1/users/me/settings` | input (documentation) | "the person's answer to analytics" | "a receipt of an answer given while signed in; the browser's own cookie decides what runs" — same validation (decision + version together), same audit row | CC1, CC2 |
