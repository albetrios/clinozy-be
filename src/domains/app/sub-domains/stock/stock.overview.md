`src/domains/app/sub-domains/stock/`

# Stock

Parent: [app](../../app.overview.md)

## Purpose

The consumables and equipment the clinic uses in procedures and never sells (launch ROUTE #137 —
routes-final 9, routes 1–28), kept apart from the medical store: their own items, vendors and
purchases. Every change to an item's quantity is one movement row, and the item's quantity is the
balance those movements leave (S5).

## Layout

| Folder / file | Role |
| --- | --- |
| [`stock-items/`](stock-items/stock-items.overview.md) | 9.A — items, their level and how long they last (routes 1–7) |
| [`stock-item-movements/`](stock-item-movements/stock-item-movements.overview.md) | 9.B — the ledger: uses, receipts, damage, returns, adjustments, reverts (routes 8–12) |
| [`stock-counts/`](stock-counts/stock-counts.overview.md) | 9.C — stock checks that adjust what differs (routes 13–15) |
| [`stock-purchases/`](stock-purchases/stock-purchases.overview.md) | 9.D — vendor bills that receive their lines, paid by supplier bills (routes 16–22) |
| [`stock-vendors/`](stock-vendors/stock-vendors.overview.md) | 9.E — who the clinic buys from and what each is owed (routes 23–28) |
| each resource's `seed/` | the one-row helpers the demo clinic seed writes the stock through (`seedStockVendor`, `seedStockItem`, `seedStockPurchase` with its lines, `seedStockCount` with its lines, `seedStockItemMovement`) — `pnpm db:seed:demo-clinic` |
| `stock.container.ts` | builds the five services |
| `stock.routes.ts` | registers the five route sets |

## Key invariants

- **One code set (S2):** `stock_item:read` · `create` · `update` · `delete` · `export` — every
  route's gate; using, receiving, adjusting, reverting and counting are `stock_item:update`.
- **Organization-wide (S3):** no stock record has a branch.
- **Exact decimals (S4):** quantities are `numeric(12,3)`, plain numbers in the API.
- **The ledger (S5):** every writer — an item's opening, a movement by hand, a count, a purchase,
  its delete and restore — goes through `stock-item-movements.ledger.ts`: one guarded `UPDATE`
  moves the balance (never below zero — a 409 `not_enough_stock`) and the movement row keeps the
  balance it left. Movements are never changed or deleted; a wrong one is reverted (S8).
- **Paying is billing's (S11):** a purchase's paid amount is kept by the supplier-bill payments
  that point at it (`app.payments.stock_purchase_id`).
