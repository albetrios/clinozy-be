`src/domains/app/sub-domains/medical/suppliers/`

# Supplier

Parent: [medical](../medical.overview.md)

## Purpose

The agencies the medical store buys from, what each is owed, and paying them (launch ROUTE #153 —
routes-final 11.B, MD10). Tables `app.suppliers` and `app.supplier_manufacturers`; never the clinic
stock's vendors. Its credits nest in [`supplier-credits/`](supplier-credits/supplier-credits.overview.md) —
their routes under `/suppliers/{supplier_id}/credits` (MD34).

## Layout

| File | Role |
| --- | --- |
| `suppliers.schema.ts` | the tables: unique name in any case, the phone and GSTIN checks, the brand links, RLS |
| `suppliers.rules.ts` | delete only with nothing owed, "Pay what is due", the account fields |
| `suppliers.repository.ts` | the shared reads and writes, the payable expression (sort and filter), the account |
| `suppliers.{dto,validator,serializer,types}.ts` | request shapes, the response with the account |
| `suppliers.service.ts` / `.controller.ts` / `.routes.ts` | routes 7–13 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/suppliers` | `medicine:read` |
| `POST /app/suppliers` | `medicine:create` |
| `GET /app/suppliers/{supplier_id}` | `medicine:read` |
| `PATCH /app/suppliers/{supplier_id}` | `medicine:update` |
| `DELETE /app/suppliers/{supplier_id}` | `medicine:delete` |
| `POST /app/suppliers/{supplier_id}/restore` | `medicine:delete` |
| `POST /app/suppliers/{supplier_id}/payments` | `payment:create` |

## Key invariants

- **`payable`** = the live received orders' dues less the live open credits (a voided credit
  counts for nothing, MD32), never below 0;
  `ageing_days` counts from the oldest received order still due.
- **Paying** applies the open credits first, then one `supplier_bill` payment per received order
  still due, oldest first, the splits taken mode by mode (`409 more_than_due` over the payable).
- **Delete only with nothing owed**, no open credit and no order waiting (`409 supplier_has_dues`).
