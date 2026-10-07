`src/domains/app/sub-domains/user-preferences/`

# User preferences

Parent: [app](../../app.overview.md)

## Purpose

Each person's own settings in an organization (launch ROUTE #8): pinned sections, the header's
branch filter (per organization, D40), theme, patient-file pins and recent dropdown picks. Table
`app.user_preferences` (one live row per person per organization), with
`app.user_preference_branches`.

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/user-preferences` | `organization:read` (every member) — defaults until the first save |
| `PATCH /app/user-preferences` | `organization:read` — the first save creates the row |

## Key invariants

- **Own rows only:** the shared app record service in owner mode — reads and writes see only the
  caller's row (`created_by_user_id`).
- **One row per person:** `idx_user_preferences_organization_user_unique`.
