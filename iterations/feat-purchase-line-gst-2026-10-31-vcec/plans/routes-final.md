# Clinozy API — final routes, sub-domain by sub-domain (feat-purchase-line-gst-2026-10-31-vcec)

Started from `main` after `change-pharmacy-record-fields` merges ([PG1](decisions.md)) on branch
`feat/purchase-line-gst` ([PG2](decisions.md)). Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md).

**How to read the tables:** paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` required; `*` = required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Medical purchase orders — GST per line, GST totals, the monthly GST summary | `medical/medical-purchase-orders/` | `medical-purchase-orders`, `medical-purchase-orders/{medical_purchase_order_id}[/receive]`, `medical-purchase-orders/gst-summary[/exports]` | 2 new, 5 changed, 2 unchanged | medicines (`gst_percent`, `hsn_code`), billing/invoices (the amounts calculation), suppliers | **final (rev 1, confirmed 2026-10-31)** — [PG17](decisions.md) |

App total: **2 routes added, 0 removed, 5 reshaped** (additive).

## Code layout and tables without routes

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 1 | `app.medical_purchase_orders` (CHANGED) | `medical/medical-purchase-orders/` | create, change, receive; payments and supplier credits (`paid_amount`, `credited_amount`) |
| 1 | `app.medical_purchase_order_items` (CHANGED, no routes of its own) | `medical/medical-purchase-orders/` | written with its order; ticked by receive |

## Rules for every sub-domain

| # | Rule |
| --- | --- |
| K1 | Additive on `v1`: optional request fields, added response fields ([PG5](decisions.md)). |
| K2 | One GST calculation in the app — `computeInvoiceAmounts` ([PG4](decisions.md)). |

## Connections

```text
1) WHO WRITES WHAT, WHO READS IT

   PO drawer (medicine:create/update) ── POST/PATCH { items[{…, gst_percent?, is_gst_inclusive?}] }
        └─► line: computeInvoiceAmounts → taxable_amount, gst_amount, amount ─► order: taxable_total, gst_total, total
   Receive drawer (medicine:update) ── POST …/receive ─► totals = the received lines' ─► due_amount (supplier dues)
   GST summary screen (medicine:read) ── GET …/gst-summary?month= ◄── received lines of the month's received orders
                                                                        × medicines.hsn_code
   CSV (medicine:export) ── GET …/gst-summary/exports

2) WHAT ONE ACTION SETS OFF

   saving an order ──► its lines' GST amounts, its totals (and its audit row, as today)
   receiving it ─────► stock, batches, prices (as today), the totals from the received lines
   reading the summary ─► nothing — a read
```

---

## 1. Medical purchase orders — GST per line, GST totals, the monthly summary — final (rev 1, confirmed 2026-10-31)

Code: `src/domains/app/sub-domains/medical/medical-purchase-orders/`. Reads `intake-files/BRIEF.md`.

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to
every route · 1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules worth
knowing · 1.11 Code changes · 1.12 Nested sub-domains.

### 1.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| PO1 | **GST on the line, as on an invoice line** — `gst_percent`, `is_gst_inclusive`, `taxable_amount`, `gst_amount` ([PG3](decisions.md)). |
| PO2 | **The invoice calculation, reused** — no discounts; per line, to the paisa ([PG4](decisions.md)). |
| PO3 | **Defaults** — the medicine's GST rate; inclusive ([PG5](decisions.md)); 0 % is "without GST bill" ([PG6](decisions.md)). |
| PO4 | **Order totals** — `taxable_total`, `gst_total`, `total = taxable_total + gst_total`; on receive, the received lines' ([PG7](decisions.md)). |
| PO5 | **Existing rows filled by the migration**, amounts and totals unchanged ([PG8](decisions.md)). |
| PO6 | **The summary** — one route + CSV, over the month's received lines, by rate and by HSN code and rate ([PG9](decisions.md), [PG11](decisions.md)–[PG13](decisions.md)). |

### 1.2 Open questions

None blocking; AMBER defaults PG11–PG15 in `decisions.md`.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.medical_purchase_orders` | the order | + `taxable_total`, `gst_total`; `chk_medical_purchase_orders_totals`; + `idx_medical_purchase_orders_organization_received`; RLS unchanged |
| `app.medical_purchase_order_items` | its lines | + `gst_percent`, `is_gst_inclusive`, `taxable_amount`, `gst_amount`; `chk_…_gst_percent`; `chk_…_amount` replaced; RLS unchanged |

```text
app.suppliers ──o{ app.medical_purchase_orders ──|{ app.medical_purchase_order_items }o── app.medicines
                    taxable_total, gst_total          gst_percent, is_gst_inclusive,          gst_percent (default),
                                                      taxable_amount, gst_amount              hsn_code (summary)
```

**PostgreSQL design:** one migration — columns, the fill, the checks, the partial index (see `db-changes.md`).

### 1.4 Permissions

| Code | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- |
| `medicine:read` | the list, an order, the GST summary | 1, 3, 5 | as today |
| `medicine:export` | the list's CSV, the summary's CSV (with `medicine:read`) | 2, 4 | as today |
| `medicine:create` / `medicine:update` | create; change, receive | 6; 7, 8 | as today |

No code added or moved.

### 1.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the organization from the `org` claim |
| Success | `200` with `{ data, meta }` |
| Money | numbers in rupees, two decimals |

### 1.6 Objects returned

**Purchase order line** (in an order's `items[]`) — adds:

| Field | Type | Notes |
| --- | --- | --- |
| `gst_percent` | number | 0, 5, 12, 18, 28 |
| `is_gst_inclusive` | boolean | the rate includes GST |
| `taxable_amount`, `gst_amount` | number | per line, to the paisa |
| `amount` | number | now `taxable_amount + gst_amount` (= quantity × rate when inclusive) |

**Purchase order** — adds `taxable_total`, `gst_total` (number); `total = taxable_total + gst_total`.

**Purchase GST summary** (route 5):

| Field | Type | Notes |
| --- | --- | --- |
| `month` | string | `YYYY-MM` |
| `by_rate[]` | `{ gst_percent, line_count, taxable_amount, gst_amount, total_amount }` | rates present, ascending |
| `by_hsn[]` | `{ hsn_code (string \| null), gst_percent, line_count, taxable_amount, gst_amount, total_amount }` | by code then rate; no code last |
| `totals` | `{ order_count, line_count, taxable_amount, gst_amount, total_amount }` | the month |

**Export** (route 4): `{ file_name, content_type, row_count, is_truncated, content }` as every export.

### 1.7 Routes

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/medical-purchase-orders` | List **(changed: output)** | `medicine:read` | |
| 2 | GET | `/medical-purchase-orders/exports` | List CSV **(changed: columns)** | `medicine:export` + read | |
| 3 | GET | `/medical-purchase-orders/{medical_purchase_order_id}` | One order **(changed: output)** | `medicine:read` | |
| 4 | GET | `/medical-purchase-orders/gst-summary/exports` | Summary CSV **(new)** | `medicine:export` + read | |
| 5 | GET | `/medical-purchase-orders/gst-summary` | Purchase GST summary of a month **(new)** | `medicine:read` | |
| 6 | POST | `/medical-purchase-orders` | Create **(changed: line input)** | `medicine:create` | req |
| 7 | PATCH | `/medical-purchase-orders/{medical_purchase_order_id}` | Change **(changed: line input)** | `medicine:update` | |
| 8 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/receive` | Receive **(changed: line input, totals)** | `medicine:update` | req |
| 9 | DELETE, POST restore | `/medical-purchase-orders/{medical_purchase_order_id}[/restore]` | cancel / undo **(unchanged)** | `medicine:delete` | — / req |

### 1.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 4, 5 | `month*` `YYYY-MM` | — | Summary / Export |
| 6, 7 | — | `items[]`: as today + `gst_percent` (0, 5, 12, 18, 28), `is_gst_inclusive` (boolean) — both optional | Purchase order |
| 8 | — | unordered lines as 6 | Purchase order |

### 1.9 Errors

| Route | Status | When |
| --- | --- | --- |
| 4, 5 | 400 `month` | missing, not `YYYY-MM`, or after the organization's current month |
| 6, 7, 8 | 400 `items` | `gst_percent` not one of the five (with today's line errors) |
| 4 | 403 | without `medicine:export` or `medicine:read` |

### 1.10 Rules worth knowing

- An exclusive line costs more than quantity × rate: its GST is on top, and the order's total and the supplier's due follow.
- The summary reads the HSN code the medicine has now (a purchase line keeps no copy).
- The month is the receive date's month in the organization's time zone.

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| POC1 | Schema + migration: the columns, the fill, the checks, the index (PO1, PO4, PO5) — schema chain |
| POC2 | DTO (line `gst_percent`, `is_gst_inclusive`; the summary query), rules (line amounts via `computeInvoiceAmounts`; order totals; receive totals), repository (the items' columns; the summary's grouped reads), serializer / types (PO1, PO2, PO4) |
| POC3 | Service + controller + routes: the summary and its CSV (PO6); route docs, OpenAPI response map, route catalog, overview |
| POC4 | Seeds (purchase-order seed, the demo clinic's stock plan) write the GST fields; tests (rules unit, integration: line math, defaults, totals, summary, CSV, gates) |

### 1.12 Nested sub-domains

None.

**Route review final — 2026-10-31.** Every sub-domain is confirmed; the frontend may kick off on these routes.
