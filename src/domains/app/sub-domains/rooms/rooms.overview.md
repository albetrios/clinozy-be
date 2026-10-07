`src/domains/app/sub-domains/rooms/`

# Room

Parent: [app](../../app.overview.md)

## Purpose

A bookable room of a branch (D28) (launch ROUTE #19). Table `app.rooms`.

## Layout

| File | Role |
| --- | --- |
| `rooms.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `rooms.constants.ts` | value lists the CHECKs and validators share |
| `rooms.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `rooms.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `rooms.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/branches/{branch_id}/rooms` | `organization:read` (every member) |
| `POST /app/branches/{branch_id}/rooms` | `room:create` |
| `GET /app/rooms/{room_id}` | `organization:read` (every member) |
| `PATCH /app/rooms/{room_id}` | `room:update` |
| `DELETE /app/rooms/{room_id}` | `room:delete` |
| `POST /app/rooms/{room_id}/restore` | `room:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
