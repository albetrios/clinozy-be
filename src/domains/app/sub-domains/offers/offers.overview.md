`src/domains/app/sub-domains/offers/`

# Offer

Parent: [app](../../app.overview.md)

## Purpose

A limited-time price on offerings (launch ROUTE #12). Table `app.offers`, with `app.offer_offerings`, `app.offer_branches`.

## Layout

| File | Role |
| --- | --- |
| `offers.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `offers.constants.ts` | value lists the CHECKs and validators share |
| `offers.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `offers.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `offers.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/offers` | `offer:read` |
| `POST /app/offers` | `price:manage` |
| `GET /app/offers/{offer_id}` | `offer:read` |
| `PATCH /app/offers/{offer_id}` | `price:manage` |
| `DELETE /app/offers/{offer_id}` | `price:manage` |
| `POST /app/offers/{offer_id}/restore` | `price:manage` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
