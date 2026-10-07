`src/domains/app/sub-domains/day-closes/`

# DayClose

Parent: [app](../../app.overview.md)

## Purpose

A branch's day — the opening cash accepted, then the count and the close (launch ROUTE #38). Table `app.day_closes`.

## Layout

| File | Role |
| --- | --- |
| `day-closes.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `day-closes.constants.ts` | value lists the CHECKs and validators share |
| `day-closes.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `day-closes.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `day-closes.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/day-closes` | `day_close:read` |
| `POST /app/day-closes` | `day_close:create` |
| `GET /app/day-closes/{day_close_id}` | `day_close:read` |
| `POST /app/day-closes/{day_close_id}/close` | `day_close:close` |
| `POST /app/day-closes/{day_close_id}/reopen` | `day_close:close` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
