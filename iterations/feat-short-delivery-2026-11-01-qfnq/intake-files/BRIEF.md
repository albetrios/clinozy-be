# Brief — Receive what actually came: received quantities per purchase line, short lines marked

<!--
Written 2026-11-01 from the user's requirement and answers (relayed by the orchestrating session).
Builds on feat-purchase-line-gst (line GST amounts) and change-pharmacy-record-fields (units_per_pack),
both merged. Entities and routes as the launch's schema-routes.md names them.
-->

## What changes

A medical purchase order line knows only whether it was received (`is_received`, yes/no). When a
supplier delivers fewer packs than ordered there is no way to record what arrived: stock and the batch
take the full ordered quantity, and the order — and what the supplier is owed — the full amount.

1. **Each line records what arrived** — `received_quantity` and `received_free_quantity` (packs),
   sent with "Receive goods", defaulting to what was ordered. The stock and the batch take the received
   packs: `(received_quantity + received_free_quantity) × units_per_pack` units.
2. **A short line closes** — the order is received with what came; the line is marked short
   (`is_short`); nothing stays pending for a later delivery.
3. **The order owes what arrived** — the line's amount (and its taxable value and GST, from
   feat-purchase-line-gst) follow the received quantity × rate; free packs cost nothing; the order's
   totals and the supplier's dues follow.
4. **An order shows which lines came short.**

Screens (clinozy-fe, medical store): the Receive goods drawer takes the received quantity and free
quantity per line (prefilled with the ordered ones); the order view marks short lines ("Short · 8 of 10").

## Why

Short deliveries are common; today the clinic's stock, batches and supplier dues overstate what came.

## Affected screens, entities and routes

- Screens: medical store › Purchases (Receive goods drawer, order view)
- Entities: medical_purchase_order_items (new `received_quantity`, `received_free_quantity`, `is_short`)
- Routes: `POST /app/medical-purchase-orders/:medical_purchase_order_id/receive` (an ordered line takes
  `received_quantity`, `received_free_quantity`); `GET /app/medical-purchase-orders[/:id]` (lines carry
  them and `is_short`; the order `short_line_count`)

## Rules

- 0 ≤ `received_quantity` ≤ `quantity`; 0 ≤ `received_free_quantity` ≤ `free_quantity` — more than
  ordered is an unexpected line, as today.
- A line received with nothing (both 0) is not received (as `is_received: false`).
- `is_short` = received and (received quantity < quantity or received free < free quantity).
- The line's `amount`, `taxable_amount`, `gst_amount` = the invoice calculation on received quantity ×
  rate; the order's totals and `due_amount` follow.
- Existing received lines: received = ordered (the migration fills them); not short.

## Acceptance criteria

- [ ] Receiving a 10-pack line as 8 (+ 1 of 2 free) adds (8 + 1) × units_per_pack units to the batch.
- [ ] That line's amount, taxable value and GST are 8 × rate's (inclusive split), and it reads `is_short: true`.
- [ ] The order's total and `due_amount` are the received lines' amounts; the order's `short_line_count` is 1.
- [ ] A line sent without received quantities receives what was ordered and is not short.
- [ ] A received quantity above the ordered one is a 400 on `items`.
- [ ] Existing received lines after the migration carry received = ordered and are not short.
- [ ] The Receive goods drawer takes received and free quantities per line; the order view marks short lines.

## Out of scope

Back-orders / pending deliveries, partial receive of the same order twice, damaged-goods returns
(supplier credits cover those), anything on production.
