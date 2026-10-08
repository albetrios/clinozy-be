`src/domains/app/sub-domains/medical/medical-sales/`

# Medical sale

Parent: [medical](../medical.overview.md)

## Purpose

The store's sales — each with its `medical` invoice — their void and undo, returns from the
patient, and the store's Payments tab (launch ROUTE #153 — routes-final 11.H, MD19–MD22). Tables
`app.medical_sales`, `app.medical_sale_returns` and `app.medical_sale_return_items`.

## Layout

| File | Role |
| --- | --- |
| `medical-sales.schema.ts` | the tables: one invoice per sale, a prescription filled once, the void reasons, returns, RLS |
| `medical-sales.rules.ts` | the sale through the invoice ledger, the void and undo with the stock, the return, the page fields |
| `medical-sales.repository.ts` | the shared reads and writes, the status filter, lines, invoices, returns |
| `medical-sales.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `medical-sales.service.ts` / `.controller.ts` / `.routes.ts` | routes 44–51 (the payments list through the payments service) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-sales` | `medicine:read` |
| `GET /app/medical-sales/exports` | `medicine:export` |
| `POST /app/medical-sales` | `medicine:create` (`payment` needs `payment:create`) |
| `GET /app/medical-sales/{medical_sale_id}` | `medicine:read` |
| `DELETE /app/medical-sales/{medical_sale_id}` | `medicine:delete` |
| `POST /app/medical-sales/{medical_sale_id}/restore` | `medicine:delete` |
| `POST /app/medical-sales/{medical_sale_id}/returns` | `payment:create` |
| `GET /app/medical-payments` | `medicine:read` |

## Key invariants

- **A sale is never edited:** its invoice is the sale's — `/invoices` refuses to change, delete or
  restore it (`409 invoice_of_sale`).
- **Void** only with nothing paid and nothing returned; it puts the stock back and deletes the
  invoice; the undo takes the stock again from the same batches.
- **Return** only on a sale paid in full; the refund is a credit note with its refund payment;
  `unused`, `doctor_changed` and `wrong_item` packs go back into their batch.
