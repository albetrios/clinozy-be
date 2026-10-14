`src/domains/app/sub-domains/medical/medical-payments/`

# Medical payments

Parent: [medical](../medical.overview.md)

## Purpose

The store's Payments tab (routes-final 11.I — MD22, MD31; launch ROUTE #193): the medical store's
slice of the payments ledger and its CSV. No table of its own — the rows are `app.payments`
(billing 8.C), read through the payments service with the `is_medical_store` derived filter:
receipts and refunds on `medical` invoices, supplier bills of medical orders, `medicines`
expenses and their reversals.

## Layout

| File | Role |
| --- | --- |
| `medical-payments.controller.ts` | the payments service under `medicine:read`, every list and export limited to the store (`listDerived`) |
| `medical-payments.routes.ts` | routes 51 and 53 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-payments` | `medicine:read` |
| `GET /app/medical-payments/exports` | `medicine:export` (and `medicine:read`) |

## Key invariants

- **Read here, written on the ledger (MD31):** recording, changing (with its edit history),
  deleting, restoring and reversing a store payment are the ledger's own routes (`/payments…`,
  8.C) with their codes and rules — a change only on an open day, a settled payment reversed,
  never edited. No second set of money routes.
- **The store's slice** is the payments repository's `is_medical_store` derived filter — the same
  condition for the list and the CSV (`medical-payments-YYYY-MM-DD.csv`).
