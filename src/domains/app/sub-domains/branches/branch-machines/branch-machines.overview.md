`src/domains/app/sub-domains/branches/branch-machines/`

# Branch machines

Parent: [branches](../branches.overview.md) — a nested sub-domain: a machine belongs to one branch and
never moves (D7).

## Purpose

A bookable machine of a branch, e.g. a laser (D28). Table `app.branch_machines` (renamed from `app.machines`, D9).

## Layout

| File | Role |
| --- | --- |
| `branch-machines.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `branch-machines.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `branch-machines.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table (parent `branch_id`) |
| `branch-machines.routes.ts` | the routes below |

## Routes

One set of permission codes for the whole branches sub-domain (D12); the reads stay open to every
member for booking (D5).

| Route | Gate |
| --- | --- |
| `GET /app/branches/{branch_id}/machines` | `organization:read` (every member) |
| `POST /app/branches/{branch_id}/machines` | `branch:create` |
| `GET /app/branches/{branch_id}/machines/{branch_machine_id}` | `organization:read` (every member) |
| `PATCH /app/branches/{branch_id}/machines/{branch_machine_id}` | `branch:update` |
| `DELETE /app/branches/{branch_id}/machines/{branch_machine_id}` | `branch:delete` |
| `POST /app/branches/{branch_id}/machines/{branch_machine_id}/restore` | `branch:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Under its branch:** a by-id route names the branch too; a machine under another branch, or a branch the caller does not work at (without `branch:read`), is a 404.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`) naming who changed it and when.
