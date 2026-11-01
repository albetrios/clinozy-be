# Clinozy API — final routes, sub-domain by sub-domain (feat-short-delivery-2026-11-01-qfnq)

Started from `main` at `791352c` on branch `feat/short-delivery` ([SD2](decisions.md)). Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md).

**How to read the tables:** paths are under `/api/v1/app`; **Gate** is the permission; **Idem** `req` = `X-Idempotency-Key` required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Medical purchase orders — what arrived | `medical/medical-purchase-orders/` | `medical-purchase-orders`, `medical-purchase-orders/{medical_purchase_order_id}[/receive]` | 0 new, 3 changed | medicines (`units_per_pack`), the line GST (#187) | **final (rev 1, confirmed 2026-11-01)** — [SD12](decisions.md) |

App total: **0 routes added, 0 removed, 3 reshaped** (additive).

## Code layout and tables without routes

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 1 | `app.medical_purchase_order_items` (CHANGED) | `medical/medical-purchase-orders/` | save; receive |

## Rules for every sub-domain

| # | Rule |
| --- | --- |
| K1 | Additive on `v1` ([SD4](decisions.md)). |
| K2 | One money calculation — `computeInvoiceAmounts` on the received quantity ([SD6](decisions.md)). |

## Connections

```text
Receive drawer ── POST …/receive { items[{ id, received_quantity?, received_free_quantity?, … }] }
   └─► line: received_*, is_short; batch += (received + received free) × units_per_pack
        └─► amount / taxable / GST on received × rate ─► order totals ─► due_amount (supplier dues)
```

---

## 1. Medical purchase orders — what arrived — final (rev 1, confirmed 2026-11-01)

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to every
route · 1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules worth knowing ·
1.11 Code changes · 1.12 Nested sub-domains.

### 1.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| SH1 | Received quantities on the line, default ordered ([SD3](decisions.md), [SD4](decisions.md)). |
| SH2 | A short line closes ([SD5](decisions.md)); nothing received = not received ([SD8](decisions.md)). |
| SH3 | Owe what arrived — amounts on received × rate ([SD6](decisions.md)). |
| SH4 | Bounds 0…ordered ([SD7](decisions.md)); `short_line_count` on the order ([SD9](decisions.md)). |

### 1.2 Open questions

None blocking; AMBER defaults SD7–SD11.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.medical_purchase_order_items` | a line | + `received_quantity`, `received_free_quantity`, generated `is_short`; `chk_…_received`; `chk_…_amount` on `coalesce(received_quantity, quantity)` |

**PostgreSQL design:** one migration — columns, fill, checks, the generated column.

### 1.4 Permissions

Unchanged: receive `medicine:update`; reads `medicine:read`.

### 1.5 Common to every route

As today: `/api/v1/app`, Bearer, `200` with `{ data, meta }`.

### 1.6 Objects returned

**Purchase order line** — adds `received_quantity`, `received_free_quantity` (integer | null), `is_short` (boolean).
**Purchase order** — adds `short_line_count` (integer).

### 1.7 Routes

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/receive` | Receive — what arrived **(changed: input)** | `medicine:update` | req |
| 2 | GET | `/medical-purchase-orders/{medical_purchase_order_id}` | One order **(changed: output)** | `medicine:read` | |
| 3 | GET | `/medical-purchase-orders` | List **(changed: output)** | `medicine:read` | |

### 1.8 Request details

| # | Body | Response |
| --- | --- | --- |
| 1 | an ordered line: as today + `received_quantity` (0…`quantity`), `received_free_quantity` (0…`free_quantity`) | Purchase order |

### 1.9 Errors

| Route | Status | When |
| --- | --- | --- |
| 1 | 400 `items` | a received quantity above the ordered one |

### 1.10 Rules worth knowing

- Both received quantities 0 → the line is not received (no batch, no amount).
- An unexpected line (no `id`) is received in full, as today.

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| SHC1 | Schema + migration (columns, fill, checks, generated `is_short`) — schema chain |
| SHC2 | DTO (received quantities), rules (bounds; stock on received × units per pack; amounts on received × rate), repository (lock the line's GST; mark received with quantities and money), serializer / types (`short_line_count`) |
| SHC3 | Route description, OpenAPI response map, overview; tests (integration A-1 – A-5) |

### 1.12 Nested sub-domains

None.

**Route review final — 2026-11-01.** Every sub-domain is confirmed; the frontend may kick off on these routes.
