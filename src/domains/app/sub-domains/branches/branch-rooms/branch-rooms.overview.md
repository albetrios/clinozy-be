`src/domains/app/sub-domains/branches/branch-rooms/`

# Branch rooms

Parent: [branches](../branches.overview.md) — a nested sub-domain: a room belongs to one branch and
never moves (D7).

## Purpose

A bookable room of a branch (D28). Table `app.branch_rooms` (renamed from `app.rooms`, D9).

## Layout

| File | Role |
| --- | --- |
| `branch-rooms.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `branch-rooms.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `branch-rooms.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table (parent `branch_id`) |
| `branch-rooms.routes.ts` | the routes below |

## Routes

One set of permission codes for the whole branches sub-domain (D12); the reads stay open to every
member for booking (D5).

| Route | Gate |
| --- | --- |
| `GET /app/branches/{branch_id}/rooms` | `organization:read` (every member) |
| `POST /app/branches/{branch_id}/rooms` | `branch:create` |
| `GET /app/branches/{branch_id}/rooms/{branch_room_id}` | `organization:read` (every member) |
| `PATCH /app/branches/{branch_id}/rooms/{branch_room_id}` | `branch:update` |
| `DELETE /app/branches/{branch_id}/rooms/{branch_room_id}` | `branch:delete` |
| `POST /app/branches/{branch_id}/rooms/{branch_room_id}/restore` | `branch:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Under its branch:** a by-id route names the branch too; a room under another branch, or a branch the caller does not work at (without `branch:read`), is a 404.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`) naming who changed it and when.
