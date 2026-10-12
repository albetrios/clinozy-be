`src/domains/app/sub-domains/memberships/`

# Memberships (team picker)

Parent: [app](../../app.overview.md)

## Purpose

The team as every member reads it (launch §2.A): the person pickers on a booking, a treatment or a
task, and the member directory — the one place the app turns a `mem_…` id into a name (K5) — and
the role directory beside it, which turns a `rol_…` id into a name and a colour (D81 (4)). The team
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
| `GET /app/memberships` | `organization:read` (every member) | active members by name; `include_ended=true` every membership, any status; `ids`, `q`, `role_id`, `branch_id`, `holds` (a permission code one of their roles grants — `holds=task:read` for a task assignee, T8); each entry says `is_owner`; paged |
| `GET /app/roles` | `organization:read` (every member) | the role directory (D81 (4)): `id`, `name`, `tone`, `is_system`, `is_locked`, in the order the roles were made (Owner, Admin, the clinic roles, then custom ones); paged |

## Key invariants

- **Reads only** — through `MembershipService.listDirectory` and `MemberRoleService.listDirectory`
  (service imports, never a tenancy repository); filters and paging run in the query (T6). `holds`
  is the tenancy membership query's `EXISTS` over the member's live roles and their codes — the rule
  the task assignee check applies to one member.
- **Names come from the membership** (`display_name`, K3), never from the login.
- **The role directory names, it does not manage**: no codes and no member counts — those stay with
  `role:read` (`/tenancy/organization/roles`).
