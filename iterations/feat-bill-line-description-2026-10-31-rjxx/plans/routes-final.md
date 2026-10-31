# Clinozy API — final routes, sub-domain by sub-domain (feat-bill-line-description-2026-10-31-rjxx)

Started from `origin/main` on branch `feat/bill-line-description`. Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md); paths
are under `/api/v1/app`.

**How to read the tables:** `{x_id}` is a public id; **Gate** is what the caller needs; **Idem** `req`
= `X-Idempotency-Key` required; `*` = required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/…`) | Paths | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Bills — a line's description | `sub-domains/billing/invoices/` (+ `medical/medical-sales/` lines read) | `invoices`, `invoices/{invoice_id}`, `invoices/preview`, `invoices/{invoice_id}/preview`, `medical-sales` | 0 new, 0 removed, bodies widened | invoices, medical-sales | **final (rev 1, confirmed 2026-10-31)** — [BD8](decisions.md) |

Total: **0 routes added, 0 removed** — `docs/routes.txt` keeps its count.

## 1. Bills — a line's description

| # | Method | Path | Gate | Idem | Body change |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/invoices` | `payment:create` | req | `items[].description` (1–280, nullable) in; returned |
| 2 | PATCH | `/invoices/{invoice_id}` | `payment:update` | — | `items[].description` in — omitted keeps the kept line's, `null` clears; returned |
| 3 | POST | `/invoices/preview` | `payment:create` | — | `items[].description` in; echoed |
| 4 | POST | `/invoices/{invoice_id}/preview` | `payment:update` | — | as #2; echoed |
| 5 | GET | `/invoices`, `/invoices/{invoice_id}`; POST `/invoices/{invoice_id}/restore` | `payment:read` / `payment:delete` | — / req | `items[].description` returned |
| 6 | GET | `/medical-sales`, `/medical-sales/{medical_sale_id}` (+ write responses) | `medicine:read` | — | `items[].description` returned |
| 7 | POST | `/medical-sales` | `medicine:create` | req | `items[].description` (1–280, nullable) in, on every line its batches draw — rev 2, [BD10](decisions.md) |

### Rules

| # | Rule |
| --- | --- |
| K1 | A description never changes a line's amounts. |
| K2 | Trimmed; empty text is a 400 — `null` clears (BD4). |
| K3 | The later Cresence backfill writes the column directly; no route is needed for it. |

### Code changes

| # | Change |
| --- | --- |
| BLD1 | `invoices.schema.ts` + migration: `description varchar(280)` |
| BLD2 | DTO (new + changed line), constants (`INVOICE_ITEM_DESCRIPTION_MAX`), lines planning (keep/replace/clear), repository reads, serializer + types (bill and preview lines) |
| BLD3 | medical-sales DTO (item `description`, rev 2), line drawing, repository read, line output + types |
| BLD4 | tests (validator unit, invoices + medical-sales route suites), OpenAPI, overview, seeds, `docs/database` DBML |

**Route review final — 2026-10-31.** Every sub-domain is confirmed; the frontend may kick off on these routes.
