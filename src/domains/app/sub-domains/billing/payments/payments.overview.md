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
| `payments.constants.ts` | kinds, directions, modes, expense categories, the fields an edit records (`PAYMENT_EDIT_RECORDED_FIELDS` — the OpenAPI response map types each one's `from` / `to` from it) |
| `payments.ledger.ts` | the money helpers every billing write shares: splits ↔ columns, the day lock, the invoice's paid amount, the pending credit's settled amount, the activity entry, `recordPayment` |
| `payments.rules.ts` | what each kind needs, the day lock, the money a write moves, the recorded edits, the reverse action, a page's link numbers and who recorded each row |
| `payments.{dto,validator,serializer,types}.ts` | request shapes, the ledger query, the response with `splits`, `edit_count`, `last_edit`, `created_by_membership_id` and the link numbers (`invoice`, `invoice_credit_note_number`, `pending_credit_number`, `stock_purchase`, `medical_purchase_order`) |
| `payments.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 12–20 (the edits page is the controller's own handler); `q` by the payee, the billed contact or the number; the billing helpers the sub-domains share — the member who recorded a row (`findRecordedByMemberships`, `membershipOfUserSql`) and `q` on the billed contact (`contactSearchSql`) |

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
- **The invoice's money moves in the same transaction (B21):** receipts add to `paid_amount`,
  refunds move theirs from `paid_amount` to `refunded_amount`, reversals undo either — in one
  guarded statement, neither under 0 nor the two together over the total (launch D93).
- **Changes are recorded (B20):** each `PATCH` writes the changed fields to `app.payment_edits` —
  `changes` is `{ field: { from, to } }`, each value shaped as its field (`splits` a list of
  `{ mode, amount }`, `paid_at` an instant, the links public ids, the texts strings; D81 PAY-M5).
- **The ledger row says what it is (D81):** who recorded it (their membership — the live one,
  else the one they left) and the numbers of what it points at, read in one batch per page.
