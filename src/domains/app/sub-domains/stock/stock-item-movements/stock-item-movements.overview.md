`src/domains/app/sub-domains/stock/stock-item-movements/`

# Stock item movement

Parent: [stock](../stock.overview.md)

## Purpose

Every change to an item's quantity, one row each (launch ROUTE #137 — routes-final 9.B, S7, S8,
S14). Table `app.stock_item_movements` — append-only.

## Layout

| File | Role |
| --- | --- |
| `stock-item-movements.schema.ts` | the table: the type fixes the sign, what made it, the unique revert link, RLS |
| `stock-item-movements.constants.ts` | the types and their signs, the revert reasons |
| `stock-item-movements.ledger.ts` | the guarded balance and the movement row — every stock writer's one way in |
| `stock-item-movements.rules.ts` | a movement by hand (`adjust` from the counted quantity), the treatment check, the revert |
| `stock-item-movements.repository.ts` | the shared reads and the insert, what reverted each row, each row's purchase and reverted-movement text, a purchase's receipts |
| `stock-item-movements.{dto,validator,serializer,types}.ts` | request shapes, the response with `reverted_by_stock_item_movement_id` and the row's text (`stock_purchase_number`, `bill_number`, `reverts_type`, `reverts_created_at`) |
| `stock-item-movements.service.ts` / `.controller.ts` / `.routes.ts` | routes 8–12 — listed on their own and under the item |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-item-movements` | `stock_item:read` |
| `GET /app/stock-items/{stock_item_id}/movements` | `stock_item:read` |
| `POST /app/stock-items/{stock_item_id}/movements` | `stock_item:update` |
| `GET /app/stock-items/{stock_item_id}/movements/{stock_item_movement_id}` | `stock_item:read` |
| `POST /app/stock-items/{stock_item_id}/movements/{stock_item_movement_id}/revert` | `stock_item:update` |

## Key invariants

- **Never changed or deleted (S5):** a wrong movement is reverted — a `reverted` row of the
  opposite change pointing at it, once (`idx_stock_item_movements_reverts`), never on a revert.
- **A use names its session, not the patient (S14):** `patient_treatment_id` only on `used`, a
  session that is not reversed.
- **Who:** `author_membership_id` is the caller (K2).
- **A row says what it points at (D81):** a row with a purchase carries its `stock_purchase_number`
  and `bill_number` (a deleted purchase still names itself); a `reverted` row the `reverts_type`
  and `reverts_created_at` of the movement it undid — two reads for the whole page, in `decorate`.
