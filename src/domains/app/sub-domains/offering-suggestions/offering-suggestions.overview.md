`src/domains/app/sub-domains/offering-suggestions/`

# OfferingSuggestion

Parent: [app](../../app.overview.md)

## Purpose

An offering suggested to a patient — the plan card (launch ROUTE #32). Table `app.offering_suggestions`.

## Layout

| File | Role |
| --- | --- |
| `offering-suggestions.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `offering-suggestions.constants.ts` | value lists the CHECKs and validators share |
| `offering-suggestions.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `offering-suggestions.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `offering-suggestions.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/offering-suggestions` | `patient:read` |
| `POST /app/patients/{patient_id}/offering-suggestions` | `patient:update` |
| `GET /app/offering-suggestions/{offering_suggestion_id}` | `patient:read` |
| `PATCH /app/offering-suggestions/{offering_suggestion_id}` | `patient:update` |
| `DELETE /app/offering-suggestions/{offering_suggestion_id}` | `patient:update` |
| `POST /app/offering-suggestions/{offering_suggestion_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
