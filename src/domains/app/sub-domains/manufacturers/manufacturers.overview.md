`src/domains/app/sub-domains/manufacturers/`

# Manufacturer

Parent: [app](../../app.overview.md)

## Purpose

A maker of medicines — the dot colour on medicine lines (launch ROUTE #44). Table `app.manufacturers`.

## Layout

| File | Role |
| --- | --- |
| `manufacturers.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `manufacturers.constants.ts` | value lists the CHECKs and validators share |
| `manufacturers.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `manufacturers.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `manufacturers.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/manufacturers` | `manufacturer:read` |
| `POST /app/manufacturers` | `manufacturer:create` |
| `GET /app/manufacturers/{manufacturer_id}` | `manufacturer:read` |
| `PATCH /app/manufacturers/{manufacturer_id}` | `manufacturer:update` |
| `DELETE /app/manufacturers/{manufacturer_id}` | `manufacturer:delete` |
| `POST /app/manufacturers/{manufacturer_id}/restore` | `manufacturer:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
