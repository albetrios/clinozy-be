# Invoices, payments and day close

Status: ready
Kind: screen
Depends on: patients, offerings, patient-file
Tables: `invoice`, `payment`, `payment_edit`, `credit_note`, `pending_credit`, `day_close`, `day_close_event` — [db-changes.md](../../db-changes.md)

## Stories

- As Front desk I want to bill and collect in one drawer so that money matches the visit.
- As an Accountant I want pending credits and a day close so that the drawer and the ledger agree.

## Rules

- Overall discount before tax; MRP includes GST (`operations.invoices`)
- Payments are never edited — reversed instead (`operations.payments`)
- Refunds by Owner, Accountant and Admin; a credit note only against an invoice (`access.refunds`)

## Acceptance criteria

- **payments-and-invoices.1** One invoice serves clinic and medical sales; lines carry qty, rate, discount and GST; the overall discount comes before tax — intake-files/PRD.md:186
- **payments-and-invoices.2** Invoice numbers run per branch GSTIN and financial year — intake-files/PRD.md:141
- **payments-and-invoices.3** Receive and Pay record payments (splits, several supplier bills); a closed day's payment is reversed, never edited — intake-files/PRD.md:88
- **payments-and-invoices.4** Pending credits settle by give back, got it back or use on the next bill — intake-files/PRD.md:88
- **payments-and-invoices.5** Day close accepts the opening cash, counts the drawer, closes with a reason when it differs and locks the day — intake-files/PRD.md:88
- **payments-and-invoices.6** Refunds issue a credit note against an invoice — intake-files/PRD.md:88

## Work items

- `data.stage-billing`
- `operations.invoices`
- `operations.payments`
- `operations.pending-credits`
- `operations.day-close`
- `access.billing-is-payments`
- `access.refunds`
- `files.payment-attachments`
- `notifications.payment-receipt`
- `notifications.payment-reminders`
- `notifications.day-close-summary`
- `background.payment-receipt`
- `background.day-close-summary`
- `background.bulk-payment-reminders`
- `background.day-auto-close`
