`src/domains/app/`

# App (the app's own records)

## Purpose

The organization's own records for the launch iteration (`iterations/launch-2026-09-30-jxmr/`), served
under `/api/v1/app` and stored in the Postgres `app` schema. It starts with the branches an organization
works from and who works in each; patients, appointments, billing and the rest join it row by row
as the launch's ROUTE builds them.

## Key invariants

- Every table is organization-scoped: ENABLE + FORCE RLS on the signed `org` claim; routes carry no
  organization segment.
- Permission codes are per resource (`branch:read|create|update|delete`, `app.permissions.ts`),
  granted to TEAM owners and the Admin role by default.
- Everyday reads every member needs (`GET /app/branches/my`) are gated by `organization:read` only;
  management routes by the resource's codes.
- A person's branches are `app.branch_members` rows on their membership (D9) — an ended
  membership's rows stay but drop out of every list (D57); a restore brings them back.

## Sub-domains

| Sub-domain | Tables | Routes |
| --- | --- | --- |
| [branches](sub-domains/branches/branches.overview.md) | `app.branches`; nested `app.branch_members`, `app.branch_rooms`, `app.branch_machines`, `app.branch_holidays` | `/app/branches`, `/app/branches/my`, `/app/branches/{branch_id}`, `/app/branches/{branch_id}/{members,rooms,machines,holidays}…` |
| [memberships](sub-domains/memberships/memberships.overview.md) | reads `tenancy.memberships` (the team picker and member directory); nested `app.membership_preferences`, `app.membership_preference_branches`, `app.membership_saved_views` | `/app/memberships`, `/app/memberships/me/{preferences,saved-views…}` |

## Patterns used

- [tenant-isolation](../../PATTERNS.md#tenant-isolation)
- [rls-context](../../PATTERNS.md#rls-context)
- [audit-emission](../../PATTERNS.md#audit-emission)
- [soft-delete](../../PATTERNS.md#soft-delete)

## Cross-domain flows

- [organization-switch-and-capability-discovery-flow](../../FLOWS.md#organization-switch-and-capability-discovery-flow) — the active organization (the `org` claim) scopes every app route.
- Reads tenancy through `OrganizationService` and `MembershipService` only (never their repositories).
