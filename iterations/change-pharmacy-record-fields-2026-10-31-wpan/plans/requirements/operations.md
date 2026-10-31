# Requirements — operations

| Identifier | Requirement | Decision |
| --- | --- | --- |
| `operations.units-per-pack-locked` | `units_per_pack` changes only while the medicine holds no stock (409 `medicine_has_stock`). | D7 |
| `operations.receive-in-units` | Receiving a line adds `(quantity + free_quantity) × units_per_pack` units to its batch and puts the line's MRP on it. | D5, D8 |
| `operations.sale-at-batch-mrp` | A medicine line is charged its batch's MRP (else the medicine's) ÷ `units_per_pack`, rounded down to the paisa. | D2, D6 |
| `operations.received-order-note` | A received order takes a change of `note` alone; the receive takes `note` too. | D10 |
