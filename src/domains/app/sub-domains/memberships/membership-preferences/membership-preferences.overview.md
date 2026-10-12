`src/domains/app/sub-domains/memberships/membership-preferences/`

# Membership preferences

Parent: [memberships](../memberships.overview.md)

## Purpose

A member's own settings in the organization (launch §2.F, U1/U4): pinned sections, theme, the
header's branch filter, patient-file pins and recent dropdown picks. One person in one organization
— `app.membership_preferences` (one row per membership, renamed from `user_preferences` at
ROUTE #127) with its branch filter `app.membership_preference_branches`.

## Layout

| File | Role |
| --- | --- |
| `membership-preferences.schema.ts` | both tables, their CHECKs, indexes and RLS policies |
| `membership-preferences.constants.ts` | the allowed values, defaults and caps |
| `membership-preferences.{dto,validator,serializer,types}.ts` | the save body, the recent-picks trim, the response |
| `membership-preferences.repository.ts` / `.service.ts` / `.controller.ts` | the upsert, the branch filter, the caller's own row |
| `membership-preferences.routes.ts` | the routes below |

## Routes

| Route | Gate | Note |
| --- | --- | --- |
| `GET /app/memberships/me/preferences` | `organization:read` (every member) | the defaults (`id` null) before the first save |
| `PATCH /app/memberships/me/preferences` | `organization:read` | at least one field; each list replaces the saved one; optional `expected_updated_at` |

## Key invariants

- **Owned by the membership (U1):** the caller's own live membership owns the row; an API key has
  none (`403`). Not branch-scoped; RLS (organization policy, ENABLE + FORCE) on both tables.
- **One row per membership, upserted (U4):** `INSERT … ON CONFLICT (membership_id) DO UPDATE`, so
  two first saves at once both land.
- **Branch filter:** `branch_ids` names branches the caller can see — every branch with
  `branch:read`, otherwise their own (`app.branch_members`); empty = every branch. A read lists only the branches the member can still see — one taken away since the save drops out, and comes back if access returns.
- **Recent picks:** `room:field:value`, newest first; the server keeps the newest 3 per
  `room:field` and drops repeats.
- **No soft delete:** the leave step deletes the row and its branch filter (K4,
  `src/domains/app/app-membership-leave.ts`); a restored member starts from the defaults.
- **Member pointer is composite** `(organization_id, membership_id)` (K8).
