`src/domains/tenancy/sub-domains/membership/membership-additional-roles/`

# Membership additional roles

Parent: [membership](../membership.overview.md)

## Purpose

The roles a person holds besides their main one (launch ROUTE #4, D5): access is the union of
every role they hold. The main role stays `memberships.role_id`; this table holds the "Also" roles,
in `position` order. A persistence module — no routes of its own; the membership routes read and
write it (`role_ids`, main first).

## Layout

| File | Role |
| --- | --- |
| `membership-additional-roles.schema.ts` | `tenancy.membership_additional_roles` — PK (membership, role), `position` 1..n, RLS |
| `membership-additional-roles.repository.ts` | list per membership (batch), replace a membership's list |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC.
- **Union of roles:** the permission resolution, the "who holds permission X" lookup, the role
  member counts and the role delete guard all read the main role **and** these rows.
- **Never the main role:** the service refuses a list with a role twice, so a role appears once
  per person — as the main role or as an additional one.
