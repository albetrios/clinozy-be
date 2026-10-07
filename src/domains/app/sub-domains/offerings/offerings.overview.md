`src/domains/app/sub-domains/offerings/`

# Offering

Parent: [app](../../app.overview.md)

## Purpose

A sellable service, package or product (launch ROUTE #11). Table `app.offerings`, with `app.offering_branches`.

## Layout

| File | Role |
| --- | --- |
| `offerings.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `offerings.constants.ts` | value lists the CHECKs and validators share |
| `offerings.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `offerings.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `offerings.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/offerings` | `organization:read` (every member) |
| `GET /app/offerings/exports` | `list:export` |
| `POST /app/offerings` | `offering:create` |
| `GET /app/offerings/{offering_id}` | `organization:read` (every member) |
| `PATCH /app/offerings/{offering_id}` | `offering:update` |
| `DELETE /app/offerings/{offering_id}` | `offering:delete` |
| `POST /app/offerings/{offering_id}/restore` | `offering:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
