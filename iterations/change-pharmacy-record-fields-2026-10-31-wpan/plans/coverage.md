# Coverage — change-pharmacy-record-fields-2026-10-31-wpan

Every `BRIEF.md` line, where the plan answers it. Brief from scratch, Baseline `none`: there is no
delta table against an earlier intake.

| Brief item | Answered by | Decision | Acceptance |
| --- | --- | --- | --- |
| Medicine drawer — HSN, Pack, Units per pack | routes-final §1.1–1.4; db-changes `medicines` | D1, D3, D9 | A1 |
| Medicine batch rows — MRP | routes-final §1.1; db-changes `medicine_batches.mrp` | D8 | A3 |
| Stock, reorder and fill-up in units | requirements `data.units` | D5 | A11 |
| `units_per_pack` changes only without stock | routes-final §1.2 | D7 | A2 |
| Supplier drawer — Email, Address | routes-final §2.1–2.4 | D9 | A4 |
| Purchase order — Note, line MRP | routes-final §3.1–3.5 | D8, D10 | A5 |
| Receive — line MRP onto the batch, units | routes-final §3.3 | D5, D8 | A6 |
| Sale — batch MRP, per unit, rounded down | routes-final §4.1 | D2, D6 | A7, A8 |
| Sale and bill lines — pack and HSN | routes-final §4.2–4.3 | D3 | A9 |
| Supplier credit per unit | routes-final §2.5 | D5 | A10 |
| Backfill, C1–C5 | out of scope | D12 | — |
| Frontend screens | clinozy-fe's iteration of the same name | D4 | the frontend's acceptance |
