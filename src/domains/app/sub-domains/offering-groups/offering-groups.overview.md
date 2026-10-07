`src/domains/app/sub-domains/offering-groups/`

# OfferingGroup

Parent: [app](../../app.overview.md)

## Purpose

A group for browsing offerings — Facial, Hair, Peel, Laser (D29) (launch ROUTE #10). Table `app.offering_groups`.

## Layout

| File | Role |
| --- | --- |
| `offering-groups.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `offering-groups.constants.ts` | value lists the CHECKs and validators share |
| `offering-groups.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `offering-groups.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `offering-groups.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/offering-groups` | `organization:read` (every member) |
| `POST /app/offering-groups` | `offering_group:create` |
| `GET /app/offering-groups/{offering_group_id}` | `organization:read` (every member) |
| `PATCH /app/offering-groups/{offering_group_id}` | `offering_group:update` |
| `DELETE /app/offering-groups/{offering_group_id}` | `offering_group:delete` |
| `POST /app/offering-groups/{offering_group_id}/restore` | `offering_group:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
