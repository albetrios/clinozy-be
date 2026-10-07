`src/domains/app/sub-domains/branches/`

# Branches

Parent: [app](../../app.overview.md)

## Purpose

A clinic location of an organization (launch ROUTE #2): address, contact, GSTIN, opening hours and
working days, the default staff per role, the maps and review links — and, in the nested
`branch-user-accesses/`, who works in each branch (D9). Tables `app.branches` and
`app.branch_user_accesses`.

## Layout

| File | Role |
| --- | --- |
| `branches.schema.ts` | `app.branches` — columns, CHECKs, indexes, `branches_tenant_isolation` RLS |
| `branches.constants.ts` | defaults (tone, state, hours, working days) and the format patterns the CHECKs use |
| `branches.{dto,validator,serializer,types}.ts` | request shapes, parsing, the typed response allow-list |
| `branches.repository.ts` | reads (full rows with default staff as `mem_` ids; summaries for `/my`) and writes |
| `branches.service.ts` | `listMine`, `list`, `get`, `create`, `update` — the rules below |
| `branches.controller.ts` / `branches.routes.ts` | the five `/app/branches` routes |
| `branch-user-accesses/` | `app.branch_user_accesses` + `GET`/`PUT /app/branches/{branch_id}/user-accesses` |
| `seed/` | `seedBranch`, `seedBranchUserAccess` (demo + bulk) |

## Routes

| Route | Gate | Note |
| --- | --- | --- |
| `GET /app/branches/my` | `organization:read` (every member) | my active branches; a `branch:read` holder gets all |
| `GET /app/branches` | `branch:read` | all, `include_inactive=true` for inactive too |
| `GET /app/branches/{branch_id}` | `branch:read` | |
| `POST /app/branches` | `branch:create` | creator gets access |
| `PATCH /app/branches/{branch_id}` | `branch:update` | any field; `null` clears an optional one |
| `GET`/`PUT /app/branches/{branch_id}/user-accesses` | `branch:update` | PUT sets the exact list |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC for both tables; the
  retention-cleanup arm (USING only) on `app.branches` lets the deleted-record purge (D38) erase rows.
- **One live main branch per organization** (`idx_branches_one_main_per_organization`) and **live
  names unique per organization, ignoring case** — both a 409.
- **Closing after opening:** checked by the DTO when both come in a body, by the service against the
  stored row on a partial update, and by `chk_branches_hours`.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a
  `delete_note`.
- **Default staff and access are memberships** (D5): a `mem_` id that is no live member here is a 400;
  removing the membership clears a default (`SET NULL`) and drops the access (`CASCADE`).
- **Value lists** (tone, weekday, delete reason) come from `@/shared/constants/clinic-record.constants.ts`.

## Lifecycle

Created and edited by Owner and Admin (Users › Branches); soft-deleted with a reason (route not built
yet), restorable until the organization's purge window (`organization_settings.deleted_record_purge_days`).
