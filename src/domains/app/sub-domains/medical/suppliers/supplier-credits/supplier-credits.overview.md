`src/domains/app/sub-domains/medical/suppliers/supplier-credits/`

# Supplier credit

Parent: [suppliers](../suppliers.overview.md)

## Purpose

"Return expiring stock" — packs taken out of a batch and what the supplier owes back for them
(launch ROUTE #153 — routes-final 11.C, MD11). Table `app.supplier_credits`; never changed or
deleted.

## Layout

| File | Role |
| --- | --- |
| `supplier-credits.schema.ts` | the table: amount = quantity × rate, the applied amount, RLS |
| `supplier-credits.ledger.ts` | applies a supplier's open credits to their received orders still due |
| `supplier-credits.rules.ts` | the stock out of the batch, the price, the author, applying it, the names |
| `supplier-credits.repository.ts` | the shared reads and writes, the open credits, the names |
| `supplier-credits.{dto,validator,serializer,types}.ts` | request shapes, the response with `status` |
| `supplier-credits.service.ts` / `.controller.ts` / `.routes.ts` | routes 14–16 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/supplier-credits` | `medicine:read` |
| `POST /app/supplier-credits` | `medicine:update` |
| `GET /app/supplier-credits/{supplier_credit_id}` | `medicine:read` |

## Key invariants

- **Applied at once:** the oldest open credit to the oldest received order still due, moving the
  order's `credited_amount` and the credit's `applied_amount` together; what is left waits for an
  order received later (receiving applies it).
