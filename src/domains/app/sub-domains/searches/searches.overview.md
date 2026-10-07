# searches

The command search (launch RC-139, ROUTE #62).

| Route | Gate | Does |
| --- | --- | --- |
| `GET /api/v1/app/searches?q=` | `organization:read` (+ each kind's `:read`) | `{ patients, leads, appointments, invoices }`, 10 each |

- No table: each kind is its own service's list with `q` — names, phones and the running number (`2841`, `#2841`, `PT-0412`), so table rules, hidden contact threads and D9 branch visibility hold.
- Appointments and invoices also include those of the first 5 patients found.
