# feat-short-delivery-2026-11-01-qfnq — decisions

Add-only. Kind: `RED` (answered by the user), `AMBER` (safe default, still open), `SCOPE` (during implementation).

The user's answers (relayed by the orchestrating session, 2026-10-31): a received quantity and received free
quantity per line, defaulting to what was ordered; stock and the batch take the received amount × units per
pack; the shortfall closes the line — no pending deliveries; the line amount and order total = received
quantity × rate (free packs cost nothing), the supplier's dues and the GST amounts follow; the Receive goods
drawer takes received quantities, the order view marks short lines; straight through; nothing on production.

| Question | Options | Decision | Date | Who | Kind |
| --- | --- | --- | --- | --- | --- |
| **SD1** — Baseline and intake | Baseline `none`, `brief` · a Baseline | **Baseline `none`, `brief`** — builds on feat-purchase-line-gst (#187) and change-pharmacy-record-fields (#182), both on `main` | 2026-11-01 | the user · Claude | RED |
| **SD2** — Branches | `claude/*` · `feat/short-delivery` | **`feat/short-delivery`** in both repositories from `origin/main` | 2026-11-01 | the user | RED |
| **SD3** — Where the received amounts live | two columns on the line · a receipt table | **Two columns on `medical_purchase_order_items`:** `received_quantity`, `received_free_quantity` (integer, null until received); plus a generated `is_short` | 2026-11-01 | the user · Claude | RED |
| **SD4** — Defaults | what was ordered · required | **Optional on receive:** unsent → the ordered `quantity` / `free_quantity` | 2026-11-01 | the user | RED |
| **SD5** — A short line | closes · stays pending | **Closes:** the order is received with what came; no later delivery | 2026-11-01 | the user | RED |
| **SD6** — What is owed | ordered × rate · received × rate | **Received × rate:** the line's `amount`, `taxable_amount`, `gst_amount` recomputed by the invoice calculation on the received quantity; totals and `due_amount` follow | 2026-11-01 | the user | RED |
| **SD7** — Bounds | ≤ ordered · any | **0 ≤ received ≤ ordered** for both (more is an unexpected line, as today) — a 400 `items` otherwise | 2026-11-01 | Claude (safe default) | AMBER |
| **SD8** — Nothing received on a line | not received · a short line of 0 | **Not received:** both 0 is `is_received: false` (no batch, no amount) — the line does not count as short | 2026-11-01 | Claude (safe default) | AMBER |
| **SD9** — The order's flag | `short_line_count` on the order · lines only | **`short_line_count`** on every order read (computed with the lines), beside each line's `is_short` | 2026-11-01 | Claude (safe default) | AMBER |
| **SD10** — Existing rows | fill received = ordered · leave null | **Filled in the migration** for received lines (`is_received` true); not short; amounts unchanged | 2026-11-01 | Claude (safe default) | AMBER |
| **SD11** — The amount check | keep `quantity × rate` · use the received quantity once received | **`coalesce(received_quantity, quantity) × rate`** is the amount (inclusive) or the taxable value (exclusive) | 2026-11-01 | Claude (be-sql-design-guard) | AMBER |
| **SD12** — Route review, sub-domain 1 | confirm · change | **Confirmed, final (rev 1)** — 0 routes new, 3 changed (receive input, order output) | 2026-11-01 | the user (straight through) · Claude | RED |
| **SD13** — Approval | approve · send back | **Approved** — straight through | 2026-11-01 | the user · Claude | RED |
| **SD14** — The demo clinic's received lines | leave the received columns empty · fill them | **Filled:** the demo clinic's seed writes received = ordered on received lines — the new check requires them | 2026-11-01 | Claude (be-seed-maintainer) | SCOPE |
