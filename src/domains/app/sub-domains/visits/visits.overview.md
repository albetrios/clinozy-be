`src/domains/app/sub-domains/visits/`

# Visit

Parent: [app](../../app.overview.md)

## Purpose

One visit in progress — the floor stage, the consult note and the safety checks (frontend D18) (launch ROUTE #22). Table `app.visits`.

## Layout

| File | Role |
| --- | --- |
| `visits.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `visits.constants.ts` | value lists the CHECKs and validators share |
| `visits.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `visits.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `visits.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/visits` | `appointment:read` |
| `GET /app/visits/{visit_id}` | `appointment:read` |
| `PATCH /app/visits/{visit_id}` | `patient:update` |
| `POST /app/visits/{visit_id}/stage` | `appointment:update` |
| `POST /app/visits/{visit_id}/pause` | `appointment:update` |
| `POST /app/visits/{visit_id}/resume` | `appointment:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
