`src/domains/app/sub-domains/billing/invoices/`

# Invoice

Parent: [billing](../billing.overview.md)

## Purpose

A bill — clinic, consultation or medical — with its lines and who is credited (launch ROUTE #136
— routes-final 8.A, B8–B15, B28). Tables `app.invoices`, `app.invoice_items` (the lines, was a
jsonb array) and `app.invoice_members` (was `app.invoice_team_memberships`). The server sets each
line's rate and GST and computes every amount; a save creates the patient offerings it sells and
bills the treatments it names.

## Layout

| File | Role |
| --- | --- |
| `invoices.schema.ts` | the three tables: the two numbers from triggers (B11), the stored amounts, generated `due_amount` / `payment_status`, the deferrable line-number key, RLS |
| `invoices.constants.ts` | types, payment statuses, GST rates, limits |
| `invoices.amounts.ts` | the amounts of a bill in paise — line and overall discounts, GST inclusive or not, the rounding (B9) |
| `invoices.lines.ts` | plans a save's lines (offerings or medicines, the plan row, the treatments, the lowest price) and writes them (B10, B13, B28) |
| `invoices.rules.ts` | the billed contact, settled and paid guards, "Paid now", the activity entry, a page's lines and contact |
| `invoices.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `invoices.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–7 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/invoices` | `payment:read` |
| `GET /app/invoices/exports` | `payment:export` |
| `POST /app/invoices` | `payment:create` |
| `GET /app/invoices/{invoice_id}` | `payment:read` |
| `PATCH /app/invoices/{invoice_id}` | `payment:update` |
| `DELETE /app/invoices/{invoice_id}` | `payment:delete` |
| `POST /app/invoices/{invoice_id}/restore` | `payment:delete` |

## Key invariants

- **Money from the server (B5, B9):** every line's and the invoice's amounts are computed and
  stored by the save; `paid_amount` moves only with payment writes; `due_amount` and
  `payment_status` are generated.
- **Editable until settled (B12):** a payment on a closed day freezes it (`409 invoice_settled`);
  the total never goes under what is paid; the date stays in its financial year.
- **Deleted only unpaid (B14):** nothing paid and no credit note; its patient offerings go and
  come back with it, none with a spent session.
- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC on all three tables.
