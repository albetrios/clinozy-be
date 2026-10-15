# feat-choose-default-clinic-2026-10-15-yizz — route changes

No route is added, removed or renamed; no status, permission, rate-limit or idempotency rule
changes. Two routes gain one field, and the login's choice of organization gains a first rule.

| Route | Before | After |
| --- | --- | --- |
| `GET /api/v1/users/me/settings` | dark mode, notifications, language, locales, consent receipt | the same + `default_organization_id` — the pinned clinic's `org_…` id, or `null` (automatic, or a pin no longer usable — [CD7](decisions.md)) |
| `PATCH /api/v1/users/me/settings` | the same fields, all optional | + optional `default_organization_id`: an `org_…` id to pin, `null` to go back to automatic. `422` `errors:defaultOrganizationUnavailable` (`reason: default_organization_unavailable`) when it is not an active clinic the caller actively belongs to ([CD6](decisions.md)); `400` when not an `org_` id |
| every login route and the `POST /auth/refresh` fallback | remembered clinic → newest clinic → personal | pinned clinic → remembered → newest → personal ([CD8](decisions.md)) |

Database changes: [db-changes.md](db-changes.md). Background work: none.
