`src/domains/app/sub-domains/credit-notes/`

# CreditNote

Parent: [app](../../app.overview.md)

## Purpose

A credit against an invoice — the invoice is never edited (D22) (launch ROUTE #36). Table `app.credit_notes`.

## Layout

| File | Role |
| --- | --- |
| `credit-notes.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `credit-notes.constants.ts` | value lists the CHECKs and validators share |
| `credit-notes.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `credit-notes.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `credit-notes.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/credit-notes` | `payment:read` |
| `GET /app/credit-notes/{credit_note_id}` | `payment:read` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
