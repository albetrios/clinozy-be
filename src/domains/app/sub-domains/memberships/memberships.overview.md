`src/domains/app/sub-domains/memberships/`

# Memberships (team picker)

Parent: [app](../../app.overview.md)

## Purpose

The team as every member reads it (launch §2.A): the person pickers on a booking, a treatment or a
task, and the member directory — the one place the app turns a `mem_…` id into a name (K5). The team
itself is the platform `tenancy` domain; this folder holds no table of its own. Its nested
sub-domains hold what is the member's own (launch §2.F–2.G):

| Nested sub-domain | Tables | Routes |
| --- | --- | --- |
| [membership-preferences](membership-preferences/membership-preferences.overview.md) | `app.membership_preferences`, `app.membership_preference_branches` | `/app/memberships/me/preferences` |
| [membership-saved-views](membership-saved-views/membership-saved-views.overview.md) | `app.membership_saved_views` | `/app/memberships/me/saved-views…` |

`memberships.rules.ts` resolves the caller's own live membership for both (`403` for an API key).

## Routes

| Route | Gate | Note |
| --- | --- | --- |
| `GET /app/memberships` | `organization:read` (every member) | active members by name; `include_ended=true` every membership, any status; `ids`, `q`, `role_id`, `branch_id`; paged |

## Key invariants

- **Reads only** — through `MembershipService.listDirectory`; filters and paging run in the query (T6).
- **Names come from the membership** (`display_name`, K3), never from the login.
