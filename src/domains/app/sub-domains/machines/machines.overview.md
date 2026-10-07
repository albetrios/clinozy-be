`src/domains/app/sub-domains/machines/`

# Machine

Parent: [app](../../app.overview.md)

## Purpose

A bookable machine of a branch, e.g. a laser (D28) (launch ROUTE #20). Table `app.machines`.

## Layout

| File | Role |
| --- | --- |
| `machines.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `machines.constants.ts` | value lists the CHECKs and validators share |
| `machines.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `machines.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `machines.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/branches/{branch_id}/machines` | `organization:read` (every member) |
| `POST /app/branches/{branch_id}/machines` | `machine:create` |
| `GET /app/machines/{machine_id}` | `organization:read` (every member) |
| `PATCH /app/machines/{machine_id}` | `machine:update` |
| `DELETE /app/machines/{machine_id}` | `machine:delete` |
| `POST /app/machines/{machine_id}/restore` | `machine:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
