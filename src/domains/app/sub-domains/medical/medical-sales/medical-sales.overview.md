`src/domains/app/sub-domains/medical/medical-sales/`

# Medical sale

Parent: [medical](../medical.overview.md)

## Purpose

The store's sales — each with its `medical` invoice — their void and undo, returns from the
patient, and who owes on them (launch ROUTE #153 — routes-final 11.H, MD19–MD21; rev 2 MD23–MD25,
ROUTE #186–#187). The store's Payments tab moved to [`medical-payments/`](../medical-payments/medical-payments.overview.md)
(MD31). Tables
`app.medical_sales`, `app.medical_sale_returns` and `app.medical_sale_return_items`.

## Layout

| File | Role |
| --- | --- |
| `medical-sales.schema.ts` | the tables: one invoice per sale, a prescription filled once, the void reasons, returns, RLS |
| `medical-sales.rules.ts` | the sale through the invoice ledger, the void and undo with the stock, the return, the page fields |
| `medical-sales.repository.ts` | the shared reads and writes, the status filter, lines, invoices, returns |
| `medical-sales.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `medical-sales.service.ts` / `.controller.ts` / `.routes.ts` | routes 44–50 and 52 (`dues` a collection view of the rules) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-sales` | `medicine:read` |
| `GET /app/medical-sales/exports` | `medicine:export` |
| `POST /app/medical-sales` | `medicine:create` (`payment` needs `payment:create`) |
| `GET /app/medical-sales/{medical_sale_id}` | `medicine:read` |
| `DELETE /app/medical-sales/{medical_sale_id}` | `medicine:delete` |
| `POST /app/medical-sales/{medical_sale_id}/restore` | `medicine:delete` |
| `POST /app/medical-sales/{medical_sale_id}/returns` | `payment:delete` (money given back, as every refund — D83, MD23) |
| `GET /app/medical-sales/dues` | `medicine:read` |

## Key invariants

- **A line's description (feat-bill-line-description BD10):** taken per item on the sale and
  written on every line its batches draw — the only way to set one, since the sale's invoice is
  never changed.
- **A sale is never edited:** its invoice is the sale's — `/invoices` refuses to change, delete or
  restore it (`409 invoice_of_sale`).
- **Void** only with nothing paid and nothing returned; it puts the stock back and deletes the
  invoice; the undo takes the stock again from the same batches.
- **Return** only on a sale paid in full — its invoice's `due_amount` is 0 (`409 sale_not_paid`;
  a refund or a store-credit return never raises it, launch D93); the refund is a credit note with
  its refund payment;
  `unused`, `doctor_changed` and `wrong_item` packs go back into their batch.
- **Price per unit (change-pharmacy-record-fields D2, D6):** a line is charged its batch's MRP (the
  medicine's when the batch has none) over the medicine's `units_per_pack`, rounded down to the
  paisa; the line snapshots the pack label (`pack_size`) and `hsn_code`. The sale's cost is the
  batch's purchase rate per unit.
