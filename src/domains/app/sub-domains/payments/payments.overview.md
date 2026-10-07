`src/domains/app/sub-domains/payments/`

# Payment

Parent: [app](../../app.overview.md)

## Purpose

Money in or out — a receipt, refund, expense, supplier bill, money back or reversal (launch ROUTE #34). Table `app.payments`.

## Layout

| File | Role |
| --- | --- |
| `payments.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `payments.constants.ts` | value lists the CHECKs and validators share |
| `payments.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `payments.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `payments.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/payments` | `payment:read` |
| `GET /app/payments/exports` | `list:export` |
| `POST /app/payments` | `payment:create` |
| `GET /app/payments/{payment_id}` | `payment:read` |
| `PATCH /app/payments/{payment_id}` | `payment:update` |
| `POST /app/payments/{payment_id}/checked` | `day_close:update` |
| `DELETE /app/payments/{payment_id}` | `payment:delete` |
| `POST /app/payments/{payment_id}/restore` | `payment:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
