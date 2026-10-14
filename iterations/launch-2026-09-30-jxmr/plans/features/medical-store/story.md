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
- A return's refund needs `payment:delete`; a partly paid sale is collected before a return (rev 2, D88 — MD23, MD24)
- A medicine is sold only through the store's sales, never on a hand-made invoice (rev 2, D88 — MD28)
- The store's payments and credits are managed in Medical; money corrections keep the ledger's codes (rev 2, D89 — MD31–MD33)

## Acceptance criteria

- **medical-store.1** Medicines are stocked by batch with expiry (MM/YY) and the nearest expiry shown — intake-files/PRD.md:75
- **medical-store.2** A sale deducts stock by earliest expiry and refuses expired batches and prices above MRP — intake-files/PRD.md:76
- **medical-store.3** Sales are viewed, collected, returned or voided (stock restored), never edited — intake-files/PRD.md:76
- **medical-store.4** Purchase orders move Ordered → Received → Paid; paying records a payment — intake-files/PRD.md:76
- **medical-store.12–14** (rev 2, D89) the store's payments and both sides of its credits managed in Medical; a return as store credit — [acceptance.md](../../acceptance.md)
- **medical-store.5–11** (rev 2, D88) the return's code and precondition, who owes on sales, goods not ordered on receive, the design's sorts and Created filter, the suppliers' footer and the PO print sheet, `/invoices` refusing medicines, the pharmacy queue's patient — [acceptance.md](../../acceptance.md)

## Work items

- `data.stage-medical-store`
- `operations.medical-store`
- `operations.medical-sales`
