# change-branches-in-navbar-2026-10-14-zrml — route changes

No route is added, removed or renamed; no status, permission or idempotency rule changes.

| Route | Before | After |
| --- | --- | --- |
| `GET` / `PATCH /api/v1/app/memberships/me/preferences` — `pinned_sections` | items one of `today … offerings, users`; default `appointments, leads, patients, payments` | items may also be `branches`; default ends with `branches` ([BN1](decisions.md), [BN2](decisions.md)) |
| `GET /api/v1/tenancy/permissions` — `category` of the four `branch:*` codes | `users` | `branches` (the Roles matrix's Branches row) |

The request side of the OpenAPI document follows the DTO (`z.enum(MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_VALUES)`);
the response map's hand-written enum and example (`tooling/openapi/response-map/schemas/app.ts`)
gain `branches` with it.
