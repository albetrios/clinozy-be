`src/domains/app/sub-domains/medical/medicines/`

# Medicine

Parent: [medical](../medical.overview.md)

## Purpose

The medicines the store sells, with their batches and what each supplier charges (launch
ROUTE #153 — routes-final 11.D, MD12–MD14). Tables `app.medicines`, `app.medicine_batches` and
`app.medicine_supplier_prices`.

## Layout

| File | Role |
| --- | --- |
| `medicines.schema.ts` | the three tables: unique names, the quick rules, quantity ≥ 0, unique batch numbers, RLS |
| `medicines.stock.ts` | the guarded batch move, the earliest-expiry draw (every writer's way in, MD4, MD5) |
| `medicines.rules.ts` | the quick rules, the batch list diff, the prices, delete at zero, the derived fields, the near-expiry discount |
| `medicines.repository.ts` | the shared reads and writes, filters and sorts, batches, prices |
| `medicines.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `medicines.service.ts` / `.controller.ts` / `.routes.ts` | routes 17–24 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medicines` | `medicine:read` |
| `GET /app/medicines/exports` | `medicine:export` |
| `POST /app/medicines` | `medicine:create` |
| `GET /app/medicines/{medicine_id}` | `medicine:read` |
| `PATCH /app/medicines/{medicine_id}` | `medicine:update` |
| `DELETE /app/medicines/{medicine_id}` | `medicine:delete` |
| `POST /app/medicines/{medicine_id}/restore` | `medicine:delete` |
| `POST /app/medicines/near-expiry-discount` | `medicine:update` |

## Key invariants

- **`quantity` is the batches' sum (MD4):** a save's `batches` is the whole list — kept ones move
  by the difference, new ones arrive, left-out ones go to zero and stay.
- **Expiry (MD5):** `expiry_month` is the month's first day; a batch of an earlier month is expired
  and never sold.
- **Delete only at zero stock** (`409 medicine_has_stock`).
