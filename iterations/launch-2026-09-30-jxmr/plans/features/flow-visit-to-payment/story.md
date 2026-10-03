# Flow 2 — visit, prescription, sale, payment

Status: ready
Kind: flow
Depends on: today-floor, patient-file, medical-store, payments-and-invoices

## Stories

- As a Doctor and Front desk we want a prescription to become a sale and a payment in a few steps so that the patient leaves served.

## Rules

- Save & sell opens the sale prefilled; stock by earliest expiry (`operations.medical-sales`)

## Acceptance criteria

- **flow-visit-to-payment.1** A quick-line prescription is saved and sold; the sale is prefilled and takes stock by earliest expiry; Receive by UPI shows in the ledger — intake-files/PRD.md:117–120

## Work items

- `operations.prescriptions`
- `operations.medical-sales`
- `operations.payments`
