# Requirements — access

| Identifier | Requirement | Decision |
| --- | --- | --- |
| `access.unchanged` | Every new field rides on the route that already writes or reads its record, behind the same gate (`medicine:*` for medicines, suppliers, orders and sales; `payment:*` for invoices). No new permission. | D11 |
