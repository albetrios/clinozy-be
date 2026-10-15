`src/domains/app/sub-domains/branches/`

# Branches

Parent: [app](../../app.overview.md)

## Purpose

A location of an organization: address, contact, GSTIN, opening hours and working days, the
default staff per role, the maps and review links. What a branch owns are its nested sub-domains,
each a folder here (D54): who works there, its rooms, machines and holidays. Table `app.branches`
at the folder root.

## Layout

| File / folder | Role |
| --- | --- |
| `branches.schema.ts` | `app.branches` — columns, CHECKs, indexes, the default-staff keys, `branches_tenant_isolation` RLS |
| `branches.constants.ts` | defaults (tone, state, hours, working days), the format patterns the CHECKs use, `BRANCH_MEMBERSHIP_IDS_MAX` |
| `branches.{dto,validator,serializer,types}.ts` | request shapes, parsing, the typed response allow-list |
| `branches.repository.ts` | reads (full rows with default staff as `mem_` ids; summaries for `/my`), writes, and the default-staff clean-up |
| `branches.service.ts` | `listMine`, `list`, `get`, `create`, `update` — the rules below |
| `branches.controller.ts` / `branches.routes.ts` | the five `/app/branches` routes |
| [`branch-members/`](branch-members/) | `app.branch_members` + `GET`/`PUT /app/branches/{branch_id}/members`; `resolveMembershipIds` (`memberships/memberships.rules.ts`) resolves `membership_ids` for both writers |
| [`branch-rooms/`](branch-rooms/branch-rooms.overview.md) | `app.branch_rooms` + `/app/branches/{branch_id}/rooms…` |
| [`branch-machines/`](branch-machines/branch-machines.overview.md) | `app.branch_machines` + `/app/branches/{branch_id}/machines…` |
| [`branch-holidays/`](branch-holidays/branch-holidays.overview.md) | `app.branch_holidays` + `/app/branches/{branch_id}/holidays…` |
| `seed/` | `seedBranch`, `seedBranchMember` (demo) and `seedBranchesBulk` |

## Routes

One set of permission codes for the whole sub-domain (D12): `branch:read|create|update|delete`.

| Route | Gate | Note |
| --- | --- | --- |
| `GET /app/branches/my` | `organization:read` (every member) | my active branches; a `branch:read` holder gets all (D1) — each with its hours and the address, phone and GSTIN a printed bill carries (D81) |
| `GET /app/branches` | `branch:read` | all active, `include_inactive=true` for retired ones too |
| `GET /app/branches/{branch_id}` | `branch:read` | |
| `POST /app/branches` | `branch:create` | `membership_ids` = who works there (D13); without it the creator does |
| `PATCH /app/branches/{branch_id}` | `branch:update` | any field, `null` clears an optional one; `expected_updated_at` (C12); `is_active=false` retires |
| `GET`/`PUT /app/branches/{branch_id}/members` | `branch:update` | PUT sets the exact list |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC for every table here.
- **Never deleted (D3):** a branch retires with `is_active=false`; it has no `deleted_at` and is not
  on the deleted-record purge list.
- **One main branch per organization** (`idx_branches_one_main_per_organization`) and **names unique
  per organization, ignoring case** — both a 409.
- **A clinic's first branch is its main branch** (feat-clinic-setup BR1–BR3): `create` writes it as main
  whenever the organization has none, unless the body itself sent `is_main: true`; two first branches at
  once leave one main — the one-main index refuses the loser inside a savepoint and it is written again as
  not main. An explicit `is_main: true` while a main exists is still the 409.
- **Closing after opening:** checked by the DTO when both come in a body, by the service against the
  stored row on a partial update, and by `chk_branches_hours`.
- **Default staff work there (D10, D14):** each default-staff field names one of the branch's live
  members, else a 400; a members `PUT` and the membership leave step clear a field whose member no
  longer works there. The keys are `(organization_id, default_<role>_membership_id)` →
  `memberships (organization_id, id)` (K8), `ON DELETE SET NULL` on the staff column only.
- **Members are memberships of this organization (K8):** `app.branch_members` keys
  `(organization_id, membership_id)` → `memberships (organization_id, id)`, `ON DELETE CASCADE`.
  An ended membership's rows stay but are hidden from the members list and `/my` (D57); a restored
  membership is back.
- **Stale saves refused (C12):** a `PATCH` with an older `expected_updated_at` is a 409
  (`record_changed`).
- **Value lists** (tone, weekday) come from `@/shared/constants/record-fields.constants.ts`.

## Lifecycle

Created and edited by Owner and Admin (the Branches room); retired, never deleted.
