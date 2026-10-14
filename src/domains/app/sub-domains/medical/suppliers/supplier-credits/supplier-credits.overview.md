`src/domains/app/sub-domains/medical/suppliers/supplier-credits/`

# Supplier credit

Parent: [suppliers](../suppliers.overview.md)

## Purpose

"Return expiring stock" — packs taken out of a batch and what the supplier owes back for them
(launch ROUTE #153 — routes-final 11.C, MD11; rev 2 ROUTE #194 — MD32, MD34). Table
`app.supplier_credits`; never changed, voided and undone; a credit is its supplier's — its routes
sit under `/suppliers/{supplier_id}/credits`, with the flat list for the Credits tab.

## Layout

| File | Role |
| --- | --- |
| `supplier-credits.schema.ts` | the table: amount = quantity × rate, the applied amount, RLS |
| `supplier-credits.ledger.ts` | applies a supplier's live open credits to their received orders still due; takes them all back and applies them again after a void or its undo |
| `supplier-credits.rules.ts` | the stock out of the batch (back on a void, out again on the undo), the price, the author, applying it, the names |
| `supplier-credits.repository.ts` | the shared reads and writes, the open credits, the names |
| `supplier-credits.{dto,validator,serializer,types}.ts` | request shapes, the response with `status` |
| `supplier-credits.service.ts` / `.controller.ts` / `.routes.ts` | routes 14–16, 54, 55, 57 (nested under the supplier — `parent`, `parentParam`) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/supplier-credits` | `medicine:read` |
| `GET /app/suppliers/{supplier_id}/credits` | `medicine:read` |
| `POST /app/suppliers/{supplier_id}/credits` | `medicine:update` |
| `GET /app/suppliers/{supplier_id}/credits/{supplier_credit_id}` | `medicine:read` |
| `DELETE /app/suppliers/{supplier_id}/credits/{supplier_credit_id}` | `medicine:delete` |
| `POST /app/suppliers/{supplier_id}/credits/{supplier_credit_id}/restore` | `medicine:delete` |

## Key invariants

- **Applied at once:** the oldest open credit to the oldest received order still due, moving the
  order's `credited_amount` and the credit's `applied_amount` together; what is left waits for an
  order received later (receiving applies it).
- **Void and undo (MD32):** a void (`mistake`, `wrong_quantity`, `supplier_refused`, `other` —
  with a note) puts the packs back into their batch; its undo takes them out again (`409
  not_enough_stock`). After either, every applied amount of the supplier is taken back and its
  live credits are applied again oldest first — where a credit went is not recorded, so what the
  store owes the supplier moves by exactly the voided credit's amount. A voided credit is kept,
  never purged, and counts for nothing (`payable`, the open-credit check, the ledger).
- **Under its supplier (MD34):** another supplier's credit on the path is a 404; the nested
  list's path wins over `?supplier_id=`.
