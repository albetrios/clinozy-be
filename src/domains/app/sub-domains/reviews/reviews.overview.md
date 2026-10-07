`src/domains/app/sub-domains/reviews/`

# Review

Parent: [app](../../app.overview.md)

## Purpose

A patient's review — Google, video, Instagram, the internal form or WhatsApp (launch ROUTE #42). Table `app.reviews`.

## Layout

| File | Role |
| --- | --- |
| `reviews.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `reviews.constants.ts` | value lists the CHECKs and validators share |
| `reviews.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `reviews.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `reviews.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/reviews` | `review:read` |
| `POST /app/patients/{patient_id}/reviews` | `review:create` |
| `GET /app/reviews/{review_id}` | `review:read` |
| `PATCH /app/reviews/{review_id}` | `review:update` |
| `DELETE /app/reviews/{review_id}` | `review:delete` |
| `POST /app/reviews/{review_id}/restore` | `review:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
