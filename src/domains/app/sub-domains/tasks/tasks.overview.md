`src/domains/app/sub-domains/tasks/`

# Task

Parent: [app](../../app.overview.md)

## Purpose

A to-do in the work queue — by hand or from a rule (launch ROUTE #58). Table `app.tasks`.

## Layout

| File | Role |
| --- | --- |
| `tasks.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `tasks.constants.ts` | value lists the CHECKs and validators share |
| `tasks.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `tasks.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `tasks.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/tasks` | `task:read` |
| `GET /app/tasks/exports` | `list:export` |
| `POST /app/tasks` | `task:create` |
| `GET /app/tasks/{task_id}` | `task:read` |
| `PATCH /app/tasks/{task_id}` | `task:update` |
| `POST /app/tasks/{task_id}/snooze` | `task:update` |
| `POST /app/tasks/{task_id}/resolve` | `task:update` |
| `DELETE /app/tasks/{task_id}` | `task:delete` |
| `POST /app/tasks/{task_id}/restore` | `task:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
