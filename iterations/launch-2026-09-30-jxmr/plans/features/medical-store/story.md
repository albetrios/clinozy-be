# Medical store

Status: ready
Kind: screen
Depends on: payments-and-invoices, patient-file
Tables: `manufacturer`, `supplier`, `medical_rep`, `medical_rep_visit`, `medicine`, `medical_purchase_order`, `medical_contact`, `medical_sale`, `supplier_credit` — [db-changes.md](../../db-changes.md)

## Stories

- As a Pharmacist I want stock by batch and expiry and sales from prescriptions so that the store never sells wrong or expired medicine.

## Rules

- Never more than a batch holds, never an expired batch, never above MRP (`operations.medical-sales`)
- Sales are never edited (`operations.medical-sales`)

## Acceptance criteria

- **medical-store.1** Medicines are stocked by batch with expiry (MM/YY) and the nearest expiry shown — intake-files/PRD.md:75
- **medical-store.2** A sale deducts stock by earliest expiry and refuses expired batches and prices above MRP — intake-files/PRD.md:76
- **medical-store.3** Sales are viewed, collected, returned or voided (stock restored), never edited — intake-files/PRD.md:76
- **medical-store.4** Purchase orders move Ordered → Received → Paid; paying records a payment — intake-files/PRD.md:76

## Work items

- `data.stage-medical-store`
- `operations.medical-store`
- `operations.medical-sales`
