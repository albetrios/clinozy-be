`src/domains/app/sub-domains/pending-credits/`

# PendingCredit

Parent: [app](../../app.overview.md)

## Purpose

Money owed to or by someone, to settle later (launch ROUTE #37). Table `app.pending_credits`.

## Layout

| File | Role |
| --- | --- |
| `pending-credits.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `pending-credits.constants.ts` | value lists the CHECKs and validators share |
| `pending-credits.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `pending-credits.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `pending-credits.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/pending-credits` | `payment:read` |
| `POST /app/pending-credits` | `payment:create` |
| `GET /app/pending-credits/{pending_credit_id}` | `payment:read` |
| `PATCH /app/pending-credits/{pending_credit_id}` | `payment:update` |
| `DELETE /app/pending-credits/{pending_credit_id}` | `payment:delete` |
| `POST /app/pending-credits/{pending_credit_id}/restore` | `payment:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
