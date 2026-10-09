# GST worked examples for the accountant (2026-10-09)

Five bills as the API computes them, for the clinic's accountant to check against the tax rules
the launch chose (task B1 in
[launch-confidence-tasks-2026-10-09.md](launch-confidence-tasks-2026-10-09.md)). Every figure is
pinned by
[`invoices.amounts.unit.test.ts`](../../src/domains/app/sub-domains/billing/invoices/__tests__/unit/invoices.amounts.unit.test.ts),
so these numbers are what a real bill shows. Amounts are in rupees.

## The rules being checked

- **D20 — discounts come off before tax.** A line's own discount, and its share of the bill's
  overall discount, are taken off first. GST is charged on what is left.
- **D21 — GST inside or on top.** Medicines sell at MRP with GST inside the price. An offering
  says whether its price includes GST. When GST is inside, the customer pays the price exactly, and
  the GST is worked out of it.
- **D23 — invoice numbers.** One series per branch (its GSTIN) and financial year, April to March,
  for example `2026-27/0001`. It restarts on 1 April. It is padded to four digits but never cut.

How the arithmetic runs, line by line:

1. Gross = quantity × rate.
2. The line discount is gross × discount % (rounded to the paisa).
3. The overall discount is shared across the lines in proportion to what each has left. The last
   line takes the rounding, never more than it has left.
4. Net = gross − both discounts.
5. GST on top: taxable = net, and GST = taxable × rate %. GST inside: taxable = net ÷ (1 + rate %),
   and GST = net − taxable.
6. Every line is rounded to the paisa. The bill's totals are the sums of its lines.

## Example 1 — a service, GST on top

| Line | Qty | Rate | Discount | Taxable | GST % | GST | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Facial | 1 | 1,000.00 | 0.00 | 1,000.00 | 18 | 180.00 | 1,180.00 |
| **Total** | | | **0.00** | **1,000.00** | | **180.00** | **1,180.00** |

## Example 2 — a package, GST inside the price

| Line | Qty | Rate | Discount | Taxable | GST % | GST | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Glow pack (6 sessions) | 1 | 6,000.00 | 0.00 | 5,084.75 | 18 | 915.25 | 6,000.00 |
| **Total** | | | **0.00** | **5,084.75** | | **915.25** | **6,000.00** |

## Example 3 — a line discount before GST

| Line | Qty | Rate | Discount | Taxable | GST % | GST | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Facial, 10% off | 1 | 1,000.00 | 100.00 | 900.00 | 18 | 162.00 | 1,062.00 |
| **Total** | | | **100.00** | **900.00** | | **162.00** | **1,062.00** |

## Example 4 — an overall discount of ₹450 across three lines

The lines come to ₹4,500, so ₹450 is 10% of each line's value.

| Line | Qty | Rate | Discount | Taxable | GST % | GST | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Peel | 1 | 2,500.00 | 250.00 | 2,250.00 | 18 | 405.00 | 2,655.00 |
| Hydrafacial | 2 | 750.00 | 150.00 | 1,350.00 | 18 | 243.00 | 1,593.00 |
| Consultation | 1 | 500.00 | 50.00 | 450.00 | 0 | 0.00 | 450.00 |
| **Total** | | | **450.00** | **4,050.00** | | **648.00** | **4,698.00** |

## Example 5 — medicines at MRP next to a service, with both kinds of discount

The overall discount is ₹100. The lines have ₹1,702 left after their own discounts (473 + 89 +
1,140). The tablets take 100 × 473 ÷ 1,702 = 27.79 of it, and the cream takes 5.22. The service
takes the rest, 66.99, on top of its own ₹60.

| Line | Qty | Rate | Discount | Taxable | GST % | GST | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tablets (MRP, GST inside) | 2 | 236.50 | 27.79 | 397.51 | 12 | 47.70 | 445.21 |
| Cream (MRP, GST inside) | 1 | 89.00 | 5.22 | 79.79 | 5 | 3.99 | 83.78 |
| Laser session, 5% off | 1 | 1,200.00 | 126.99 | 1,073.01 | 18 | 193.14 | 1,266.15 |
| **Total** | | | **160.00** | **1,550.31** | | **244.83** | **1,795.14** |

## Questions for the accountant

1. Is an overall discount taken off before GST (D20), and shared by value as in examples 4 and 5?
2. On medicines sold at MRP, is GST worked out of the price as in example 5 (D21)?
3. Is rounding each line to the paisa, then adding the lines, acceptable? The other way is to round
   the bill's GST once.
4. The bill shows one GST figure per line. Should a tax invoice also split it into CGST and SGST
   (half each, within the state) or IGST? Today it does not.
5. Is one invoice series per branch GSTIN and financial year right (D23)? For example,
   `2026-27/0001` and up, restarting on 1 April.
