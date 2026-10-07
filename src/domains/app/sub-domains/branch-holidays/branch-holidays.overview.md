`src/domains/app/sub-domains/branch-holidays/`

# BranchHoliday

Parent: [app](../../app.overview.md)

## Purpose

A day a branch is closed — no slots are offered (D41) (launch ROUTE #18). Table `app.branch_holidays`.

## Layout

| File | Role |
| --- | --- |
| `branch-holidays.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `branch-holidays.constants.ts` | value lists the CHECKs and validators share |
| `branch-holidays.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `branch-holidays.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `branch-holidays.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/branches/{branch_id}/holidays` | `organization:read` (every member) |
| `POST /app/branches/{branch_id}/holidays` | `branch_holiday:create` |
| `GET /app/branch-holidays/{branch_holiday_id}` | `organization:read` (every member) |
| `PATCH /app/branch-holidays/{branch_holiday_id}` | `branch_holiday:update` |
| `DELETE /app/branch-holidays/{branch_holiday_id}` | `branch_holiday:delete` |
| `POST /app/branch-holidays/{branch_holiday_id}/restore` | `branch_holiday:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
