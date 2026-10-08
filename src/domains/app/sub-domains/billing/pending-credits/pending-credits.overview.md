`src/domains/app/sub-domains/billing/pending-credits/`

# Pending credit

Parent: [billing](../billing.overview.md)

## Purpose

Money owed to or by someone — a contact or a typed name — settled in parts (launch ROUTE #136 —
routes-final 8.D, B23–B24). Table `app.pending_credits`.

## Layout

| File | Role |
| --- | --- |
| `pending-credits.schema.ts` | the table: `0 ≤ settled ≤ amount`, `open` exactly while some is left, RLS |
| `pending-credits.constants.ts` | directions, statuses, settle methods |
| `pending-credits.rules.ts` | who it is with, change and delete only while nothing is settled, the settle action |
| `pending-credits.repository.ts` | the shared reads and writes, plus the guarded settled amount |
| `pending-credits.{dto,validator,serializer,types}.ts` | request shapes, the response with `left_amount` and `payment_ids` |
| `pending-credits.service.ts` / `.controller.ts` / `.routes.ts` | routes 21–27 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/pending-credits` | `payment:read` |
| `POST /app/pending-credits` | `payment:create` |
| `GET /app/pending-credits/{pending_credit_id}` | `payment:read` |
| `PATCH /app/pending-credits/{pending_credit_id}` | `payment:update` |
| `DELETE /app/pending-credits/{pending_credit_id}` | `payment:delete` |
| `POST /app/pending-credits/{pending_credit_id}/restore` | `payment:delete` |
| `POST /app/pending-credits/{pending_credit_id}/settle` | `payment:create` |

## Key invariants

- **Settled in parts by payments (B24):** a refund (with a credit note on its invoice), money
  back, or a receipt paid by `credit_amount` on one of the party's invoices; each points at the
  credit and moves its settled amount in the same transaction.
- **The organization's (B4):** no branch filter.
