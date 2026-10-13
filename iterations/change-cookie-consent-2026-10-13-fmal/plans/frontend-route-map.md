# Frontend route map — change-cookie-consent-2026-10-13-fmal

For the frontend: what changed in the API for this iteration, each design operation's route, the
routes this fix touches, and the design features the backend dropped.

Section 3 lists only the routes this fix touches (CC11); the tool's full generated catalog was
trimmed — `docs/routes.txt` is the complete list.

## 1. What changes on every call

**None.** No route, body, status, header or permission changed (`docs/routes.txt` unchanged). What
changes is how the frontend uses one pair of fields:

| Route | Field(s) | Before | After |
| --- | --- | --- | --- |
| `PATCH /users/me/settings` | `analytics_consent` + `analytics_consent_version` | sent on every answer and at sign-in when the browser's answer was the later one | sent only for an answer given **while signed in** — a receipt (the new notice is policy version **2**); never at sign-in |
| `GET /users/me/settings` | `analytics_consent`, `analytics_consent_version`, `analytics_consent_at` | read at every sign-in; the later of the account's and the browser's answers won | **not read for consent** — the browser's `clinozy-consent-preferences` cookie decides |
| `POST /auth/logout` | — | the frontend forgot the browser's answer when the session ended | unchanged on the server (no `Clear-Site-Data`, no consent cookie — pinned); the frontend keeps the cookie |

## 2. Each design operation → its route

Brief mode: `BRIEF.md` adds no design operation and `schema-routes.md` is unchanged from the
Baseline (its operations map as in `launch-2026-09-30-jxmr/plans/frontend-route-map.md`). The brief's
one server touch:

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| Record the answer given while signed in (`BRIEF.md:42`) | `PATCH /users/me/settings` | `{ analytics_consent, analytics_consent_version }`, together; audited as `user.settings.analytics_consent.update` |

## 3. The routes this iteration touches

Trimmed to this fix (decision CC11); the full catalog (439 routes) is `docs/routes.txt`.
**Gate**: `signed in` or a token. **#**: the route review number (`routes-final.md` § 1.7). Success
is `200`.

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/logout` | token (access-token) |  |  | 1.3 | Logout current session |
| GET | `/users/me/settings` | signed in |  |  | 1.1 | Get my settings |
| PATCH | `/users/me/settings` | signed in |  |  | 1.2 | Update my settings |

## 4. In the design, dropped — remove from the frontend

- The consent read at sign-in and the forget-at-sign-out (`consent-account-sync.ts`, launch D161):
  the account's consent no longer drives the card ([CC1](decisions.md), [CC3](decisions.md)).
