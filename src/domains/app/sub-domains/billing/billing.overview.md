`src/domains/app/sub-domains/billing/`

# Billing

Parent: [app](../../app.overview.md)

## Purpose

Bills, the money in and out, refunds, what is owed either way, and each branch's daily cash close
(launch ROUTE #136 — routes-final 8, routes 1–32). The server computes every amount, keeps what an
invoice has paid in the payment's transaction, and a closed day locks its money (B5, B6). The
platform's `src/domains/billing/` (the Stripe subscription, Postgres schema `billing`) is a
different folder and schema.

## Layout

| Folder / file | Role |
| --- | --- |
| [`invoices/`](invoices/invoices.overview.md) | 8.A — bills, their lines and who is credited (routes 1–7) |
| [`invoice-credit-notes/`](invoice-credit-notes/invoice-credit-notes.overview.md) | 8.B — an invoice's refund with its payment (routes 8–11) |
| [`payments/`](payments/payments.overview.md) | 8.C — the ledger: receipts, payouts, refunds, reversals, what changed (routes 12–20) |
| [`pending-credits/`](pending-credits/pending-credits.overview.md) | 8.D — money owed to or by someone, settled in parts (routes 21–27) |
| [`day-closes/`](day-closes/day-closes.overview.md) | 8.E — each branch's day of cash, and the auto-close worker (routes 28–32, WC-39) |
| `billing.container.ts` | builds the five services (credit notes read their invoice through the invoice service) |
| `billing.routes.ts` | registers the five route sets |

## Key invariants

- **One code set (B2):** `payment:read` · `create` · `update` · `delete` · `export` — every route's gate.
- **Who gives money back (D25, launch D83):** a refund is `payment:delete` (Owner, Admin, Accountant)
  — the credit note's route, and the settlement of a `give` pending credit (money or used on a bill;
  a 403 `missing_permission`). Taking payments — receipts, `money_back` (money coming *to* the clinic),
  expenses, supplier bills — stays `payment:create`. The day is closed with `payment:update` (whoever
  counts the drawer) and reopened with `payment:delete`.
- **The billed person is a contact (B3):** invoices, payments and pending credits carry
  `contact_id`; a clinic or consultation bill's contact needs a patient file.
- **Branch (B4):** invoices, payments and day closes are branch-filtered (`branch:read` sees
  every branch); credit notes follow their invoice's branch; pending credits are the organization's.
- **A closed day locks its money (B6):** every payment write reads the day close `FOR SHARE`,
  closing takes it `FOR UPDATE`; settled money is undone only by a reversal.
- **Activity (B7):** billing, receiving, refunding and reversing write a `system` entry in the
  contact's activity.
- **The desk's reads (D81):** `q` finds the billed person (the contact's names and numbers) on
  invoices, payments and pending credits; their rows carry `created_by_membership_id` (who
  recorded it); ledger rows carry the numbers of what they point at; the invoice list sums
  `meta.due_total` / `meta.paid_total`; the invoice previews answer a bill's lines and totals
  without writing; billing applies the best live offer (M26).
