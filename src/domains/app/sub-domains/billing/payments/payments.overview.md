`src/domains/app/sub-domains/billing/payments/`

# Payment

Parent: [billing](../billing.overview.md)

## Purpose

One entry of money in or out — the ledger (launch ROUTE #136 — routes-final 8.C, B17–B22).
Tables `app.payments` (splits as columns) and `app.payment_edits` (what each change changed).

## Layout

| File | Role |
| --- | --- |
| `payments.schema.ts` | the two tables: kind ↔ direction, the split columns summing to `amount`, the links, RLS |
| `payments.constants.ts` | kinds, directions, modes, expense categories |
| `payments.ledger.ts` | the money helpers every billing write shares: splits ↔ columns, the day lock, the invoice's paid amount, the pending credit's settled amount, the activity entry, `recordPayment` |
| `payments.rules.ts` | what each kind needs, the day lock, the money a write moves, the recorded edits, the reverse action |
| `payments.{dto,validator,serializer,types}.ts` | request shapes, the ledger query, the response with `splits`, `edit_count`, `last_edit` |
| `payments.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 12–20 (the edits page is the controller's own handler) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/payments` | `payment:read` |
| `GET /app/payments/exports` | `payment:export` |
| `POST /app/payments` | `payment:create` |
| `GET /app/payments/{payment_id}` | `payment:read` |
| `PATCH /app/payments/{payment_id}` | `payment:update` |
| `GET /app/payments/{payment_id}/edits` | `payment:read` |
| `POST /app/payments/{payment_id}/reverse` | `payment:delete` |
| `DELETE /app/payments/{payment_id}` | `payment:delete` |
| `POST /app/payments/{payment_id}/restore` | `payment:delete` |

## Key invariants

- **Kind fixes direction (B17); splits add up (B18)** — both held by `CHECK`s.
- **A closed day locks its money (B6):** every write reads the day close `FOR SHARE`; a settled
  payment is undone only by a reversal (once).
- **The invoice's paid amount moves in the same transaction (B21):** receipts add, refunds take
  away, reversals undo — in one guarded statement, never under 0 nor over the total.
- **Changes are recorded (B20):** each `PATCH` writes the changed fields to `app.payment_edits`.
