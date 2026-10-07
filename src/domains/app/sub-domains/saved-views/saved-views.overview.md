`src/domains/app/sub-domains/saved-views/`

# SavedView

Parent: [app](../../app.overview.md)

## Purpose

A person's named filter set and hidden columns on a list (launch ROUTE #9). Table `app.saved_views`.

## Layout

| File | Role |
| --- | --- |
| `saved-views.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `saved-views.constants.ts` | value lists the CHECKs and validators share |
| `saved-views.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `saved-views.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `saved-views.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/saved-views` | `organization:read` (every member) |
| `POST /app/saved-views` | `organization:read` (every member) |
| `GET /app/saved-views/{saved_view_id}` | `organization:read` (every member) |
| `PATCH /app/saved-views/{saved_view_id}` | `organization:read` (every member) |
| `DELETE /app/saved-views/{saved_view_id}` | `organization:read` (every member) |
| `POST /app/saved-views/{saved_view_id}/restore` | `organization:read` (every member) |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
