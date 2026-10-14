# feat-default-clinic-at-login-2026-10-14-cpjx — route changes

No route is added, removed or renamed; no request, response, status, permission, rate-limit or
idempotency rule changes. Which organization the minted token names changes for the routes below
([DC5](decisions.md), [DC6](decisions.md)).

| Route | Before | After |
| --- | --- | --- |
| `POST /api/v1/auth/switch-to-organization` | re-mints the token for the organization and re-binds the session | the same, then remembers the organization as the caller's login default (`auth.users.last_active_organization_id`, only when it changes; a failure is logged, never returned — [DC7](decisions.md)). `schema.description` says so |
| `POST /api/v1/auth/login` · `/auth/email/login` · `GET /api/v1/auth/oauth/{provider}/callback` · `/auth/webauthn/authenticate/verify` · `/auth/mfa/login` | token `org` = the personal workspace (when enabled), else the most recently joined clinic | token `org` = the remembered clinic, else the most recently joined clinic, else the personal workspace (team organizations enabled; B2C unchanged) |
| `POST /api/v1/auth/refresh` | when the session's organization is no longer valid: the old default | the same fallback, now the new default; a valid session organization is still preserved (audit-#3) |
| `POST /api/v1/auth/switch-to-personal` | unchanged | unchanged — it does not touch the remembered clinic |

Database changes: [db-changes.md](db-changes.md) (none to the schema). Background work: none.
