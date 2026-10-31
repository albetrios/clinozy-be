# Story — a loose sale at the batch MRP

**As** the pharmacy desk, **I want** to receive a strip of 10 at its printed MRP and sell three tablets of it,
**so that** the bill charges three tenths of that batch's MRP (never more) and the stock drops by three tablets.

1. A medicine with `units_per_pack` 10 and MRP ₹120.00.
2. An order of 5 packs at ₹80.00, MRP ₹125.55 on the line; receive it → the batch holds 50 units, MRP ₹125.55.
3. Sell 3 units → one line, `quantity` 3, `rate` ₹12.55, `pack_size` the pack label, `hsn_code` the HSN; stock 47.
4. Return 1 unit → stock 48.

- Routes: routes-final §3.3, §4.1.
- Decisions: D2, D5, D6, D8.
- Acceptance: A6–A9.
