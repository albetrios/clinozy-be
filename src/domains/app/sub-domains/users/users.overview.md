# users

The team as every role may read it (launch RC-11, ROUTE #61) — staff, doctors, therapists are users filtered by role.

| Route | Gate | Does |
| --- | --- | --- |
| `GET /api/v1/app/users` | `organization:read` | active members: `id` (membership), name, avatar, staff number, tone, `role_ids`, `branch_ids`; `?q=&role_id=&branch_id=` |

- No table: it reads `tenancy.memberships` through `MembershipService.list` (at most 5 pages of 100) and drops the phone, hours and commission the team admin route carries.
