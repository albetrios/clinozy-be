`src/domains/app/sub-domains/billing/invoices/`

# Invoice

Parent: [billing](../billing.overview.md)

## Purpose

A bill — clinic, consultation or medical — with its lines and who is credited (launch ROUTE #136
— routes-final 8.A, B8–B15, B28). Tables `app.invoices`, `app.invoice_items` (the lines, was a
jsonb array) and `app.invoice_members` (was `app.invoice_team_memberships`). The server sets each
line's rate and GST and computes every amount — a new offering line at its billed price, the best
live offer on the invoice date at the branch, never below the lowest price (M26, routes-final
§3.10); a save creates the patient offerings it sells and bills the treatments it names. Two
previews answer what a bill or a change would come to and write nothing (D81, Q2).

## Layout

| File | Role |
| --- | --- |
| `invoices.schema.ts` | the three tables: the two numbers from triggers (B11), the stored amounts, generated `due_amount` / `payment_status`, the deferrable line-number key, RLS |
| `invoices.constants.ts` | types, payment statuses, GST rates, limits |
| `invoices.amounts.ts` | the amounts of a bill in paise — line and overall discounts, GST inclusive or not, the rounding (B9) |
| `invoices.pricing.ts` | the billed price of an offering — the best live offer on its base price, never below the lowest price, and the free sessions of an extra-sessions offer (M26) |
| `invoices.lines.ts` | plans a save's lines (offerings or medicines, the billed price, the plan row, the treatments, the lowest price — naming the line, `items/<n>`) and writes them (B10, B13, B28, M26) |
| `invoices.rules.ts` | the billed contact, settled and paid guards, "Paid now", the activity entry, the two previews, a page's lines, contact and who billed it |
| `invoices.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `invoices.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–7, the previews; `q` by the billed contact; the list's `meta.due_total` / `meta.paid_total` (D81) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/invoices` | `payment:read` |
| `GET /app/invoices/exports` | `payment:export` |
| `POST /app/invoices` | `payment:create` |
| `POST /app/invoices/preview` | `payment:create` (nothing written — the key optional) |
| `GET /app/invoices/{invoice_id}` | `payment:read` |
| `PATCH /app/invoices/{invoice_id}` | `payment:update` |
| `POST /app/invoices/{invoice_id}/preview` | `payment:update` (nothing written — the key optional) |
| `DELETE /app/invoices/{invoice_id}` | `payment:delete` |
| `POST /app/invoices/{invoice_id}/restore` | `payment:delete` |

## Key invariants

- **Money from the server (B5, B9):** every line's and the invoice's amounts are computed and
  stored by the save; `paid_amount` and `refunded_amount` move only with payment writes (a refund
  moves its money from one to the other); `due_amount` (total − paid − refunded) and
  `payment_status` are generated, so a refunded invoice owes no more than before it (launch D93).
- **Billed at the live offer (M26):** a new or changed offering line's rate is the lowest of its
  live percent, amount-off and fixed-price offers on the offer price (else the list price) at the
  invoice's branch on its date, raised to the lowest price; a session line adds the most free
  sessions a live extra-sessions offer gives. A kept line keeps its rate and its sessions per unit.
- **A preview writes nothing (D81, Q2):** it plans exactly as the save does and refuses what the
  save would (a bill's contact may wait until the patient is picked).
- **A line's description (feat-bill-line-description BD4):** optional free text (1–280), printed
  under the line's name; on a change a kept line keeps it unless sent, `null` clears it. It never
  moves an amount. Medical sale lines show it too (taken on `POST /app/medical-sales`).
- **Editable until settled (B12):** a payment on a closed day freezes it (`409 invoice_settled`);
  the total never goes under what is paid; the date stays in its financial year.
- **Deleted only unpaid (B14):** nothing paid and no credit note; its patient offerings go and
  come back with it, none with a spent session.
- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC on all three tables.
