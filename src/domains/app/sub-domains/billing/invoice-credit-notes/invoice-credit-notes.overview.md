`src/domains/app/sub-domains/billing/invoice-credit-notes/`

# Invoice credit note

Parent: [billing](../billing.overview.md)

## Purpose

An invoice's refund document — "CN-001" — written together with its refund payment (launch
ROUTE #136 — routes-final 8.B, B16). Table `app.invoice_credit_notes` (was
`app.credit_notes`). Never edited; deleting its refund payment on an open day removes it too.

## Layout

| File | Role |
| --- | --- |
| `invoice-credit-notes.schema.ts` | the table: the counter number, `amount > 0`, the invoice `RESTRICT`, RLS |
| `invoice-credit-notes.rules.ts` | the paid-amount check and the refund payment in the same transaction; a page's `payment_id` |
| `invoice-credit-notes.service.ts` | nested under the invoice — its branch through `InvoicesService` (B4) |
| `invoice-credit-notes.{dto,validator,serializer,types}.ts` | the refund body, the list queries |
| `invoice-credit-notes.repository.ts` / `.controller.ts` / `.routes.ts` | routes 8–11 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/invoice-credit-notes` | `payment:read` |
| `GET /app/invoices/{invoice_id}/credit-notes` | `payment:read` |
| `POST /app/invoices/{invoice_id}/credit-notes` | `payment:delete` — a refund gives money back: Owner, Admin, Accountant (D25, launch D83 (1)) |
| `GET /app/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}` | `payment:read` |

## Key invariants

- **A refund is a credit note plus its payment (B16):** up to what the invoice has paid
  (`409 more_than_paid`), on the invoice's branch and an open day.
- **Branch through the invoice (B4):** another branch's invoice is a 404 without `branch:read`;
  the organization-wide list keeps to the caller's branches.
