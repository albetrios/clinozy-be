# Clinic stock

Status: ready
Kind: screen
Depends on: payments-and-invoices
Tables: `stock_vendor`, `stock_item`, `stock_purchase`, `stock_movement`, `stock_count` — [db-changes.md](../../db-changes.md)

## Stories

- As a Therapist or Front desk I want to record what is used and what is in stock so that the clinic never runs out.

## Rules

- Every change is a movement; Undo writes a reversing movement (`operations.clinic-stock`)

## Acceptance criteria

- **clinic-stock.1** Items show stock in their unit; "Use" records a movement that can be undone — intake-files/PRD.md:82
- **clinic-stock.2** A stock check records counted against system and adjusts — intake-files/PRD.md:82
- **clinic-stock.3** A purchase records the vendor bill; typing paid records the payment — intake-files/PRD.md:82

## Work items

- `data.stage-clinic-stock`
- `operations.clinic-stock`
