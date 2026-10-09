# Launch confidence — plan for the code tasks (2026-10-09)

The plan for the *Code* tasks in
[launch-confidence-tasks-2026-10-09.md](launch-confidence-tasks-2026-10-09.md). The *Clinic* and
*Ops* tasks stay with the people who own them (listed at the end). Work runs in batches. Each
batch writes its tests and runs the lanes it touches. It fixes whatever the tests find, passes
Biome, typecheck and tsdoc, then is committed and pushed. The full `pnpm test`,
`pnpm test:rls-role` and SonarQube run after the last batch.

**Rules for every batch:**

- Tests go where the repository puts them: `__tests__/integration/*.integration.test.ts`,
  `__tests__/unit/`, the property lane (`*.property.unit.test.ts`), the e2e flows
  (`src/domains/app/__tests__/e2e/`) and the security lane. No new curl checks — the live checks
  are temporary.
- A test that finds a bug fixes the code in the same batch. The fix is recorded in **Findings**
  below.
- A behavior change (a new env value, a column, a provider call) is decided by recommendation and
  recorded under **Decisions** below.
- Races are tested with parallel requests (`Promise.all` over `fastify.inject`). Each request runs
  in its own unit of work, so the database's locks and constraints decide the winner.

## Batches

| Batch | Tasks | What lands |
| --- | --- | --- |
| 1 — Billing | B1 (worked examples), B2, B3, B4, B5 | Property tests on `computeInvoiceAmounts`; five worked invoices pinned by a test and written out for the accountant; financial-year rollover per GSTIN; parallel payments, credit notes and a close; the refund flow e2e |
| 2 — Races | AP2, S1, MD2, PT2, L1, AP3 | Parallel-request tests: one slot booked twice (exclusion constraints, A3), one item issued twice, the last medicine unit sold twice, the last session spent twice, one lead claimed twice; the appointment status machine as a table |
| 3 — Gates and isolation | PT1, PT3, T1, T2, T3, P2, RL1, RL2 | A policy test pinning the clinical codes of each role preset; prescription approval edges; extra roles end to end and at once; preferences and saved views edges; the locked Admin role; branch access per section; the unit-db lane as the RLS role; the read-only retention arm |
| 4 — Time and edges | AP1, P1, R1, R3, A2, A3, S2, MD1, MD3, C1, O1 | Midnight and time-zone bookings, holidays, task rules around due times with a fixed clock, overlapping rule runs, purge with dependents, lead hold release by the worker, a count while movements post, earliest-expiry batches, returns across batches, household numbers, offers at the edges |
| 5 — Providers | M1, M3, M4, M5, I2, I4, I5, X4 | WhatsApp templates outside the 24-hour window (D32); Meta and Anthropic outage tests; failure metrics; STOP opt-out; the ideas evaluation script; a daily per-organization cap on Claude calls |
| 6 — Flows | F1, F2 | Unhappy-path flows (no-show, cancel, refund, expired package) and a day in the clinic across two branches |
| 7 — Performance | C2, R2, X2 | The activity stream at volume; the task-rules sweep at scale; k6 scenarios for Today, the patient file and billing |
| 8 — Housekeeping | X5, X6 | The index follow-ups; the temporary live checks removed once the suites hold their cases |

## Status

| Task | Batch | Status | Evidence |
| --- | --- | --- | --- |
| B1 — worked examples (code part) | 1 | done | [gst-worked-examples-2026-10-09.md](gst-worked-examples-2026-10-09.md), pinned by `invoices.amounts.unit.test.ts` |
| B2 — property tests on totals | 1 | done | `invoices.amounts.property.unit.test.ts` (6 properties; 5,000 runs × 3 clean after the fix below) |
| B3 — financial-year rollover | 1 | done | `invoice-numbering.integration.test.ts` › restarts each branch's series on 1 April |
| B4 — billing concurrency | 1 | done | `billing-races.integration.test.ts` (receipts past the total, refunds of everything paid, a close racing a payment) |
| B5 — refund flow e2e | 1 | done | `flow-refund-and-credit.e2e.test.ts` |
| AP2 — one slot booked twice | 2 | done | `app-races.integration.test.ts` › AP2 (the exclusion constraints hold) |
| S1 — concurrent stock movements | 2 | done | `app-races.integration.test.ts` › S1 × 2 (the row lock holds) |
| MD2 — the last unit sold twice | 2 | done | `app-races.integration.test.ts` › MD2 |
| PT2 — the last session spent twice | 2 | done | `app-races.integration.test.ts` › PT2 (the guarded counter holds) |
| L1 — one lead claimed twice | 2 | done | `app-races.integration.test.ts` › L1 — after the fix below |
| AP3 — appointment status machine | 2 | done | `appointments-lifecycle.integration.test.ts` (60 pairs against A5, plus pause, resume and stage) |
| PT1 — clinical gates pinned | 3 | planned | — |
| PT3 — prescription approval edges | 3 | planned | — |
| T1 — extra roles end to end | 3 | planned | — |
| T2 — preferences and saved views | 3 | planned | — |
| T3 — the locked Admin role | 3 | planned | — |
| P2 — branch access per section | 3 | planned | — |
| RL1 — unit-db lane as the RLS role | 3 | planned | — |
| RL2 — read-only retention arm | 3 | planned | — |
| AP1 — time zones and midnight | 4 | planned | — |
| P1 — holidays, rooms and machines in booking | 4 | planned | — |
| R1 — task rules at their due times | 4 | planned | — |
| R3 — overlapping rule runs | 4 | planned | — |
| A2 — purge with dependents | 4 | planned | — |
| A3 — lead hold release by the worker | 4 | planned | — |
| S2 — a count while movements post | 4 | planned | — |
| MD1 — earliest-expiry batches | 4 | planned | — |
| MD3 — returns across batches | 4 | planned | — |
| C1 — household numbers | 4 | planned | — |
| O1 — offers at the edges | 4 | planned | — |
| M1 — WhatsApp templates (code part) | 5 | planned | — |
| M3 — Meta outage pause | 5 | planned | — |
| M4 / X4 — failure metrics (code part) | 5 | planned | — |
| M5 — STOP opt-out | 5 | planned | — |
| I2 — ideas evaluation script | 5 | planned | — |
| I4 — daily cap on Claude calls | 5 | planned | — |
| I5 — Anthropic outage pause | 5 | planned | — |
| F1 — unhappy-path flows | 6 | planned | — |
| F2 — a day in the clinic | 6 | planned | — |
| C2 — the activity stream at volume | 7 | planned | — |
| R2 — the sweep at scale | 7 | planned | — |
| X2 — k6 scenarios for the app | 7 | planned | — |
| X5 — index follow-ups | 8 | planned | — |
| X6 — remove the temporary live checks | 8 | planned | — |

## Decisions

Taken by recommendation (no question asked), one line each, as the batches reach them.

## Findings

Bugs the new tests found, and their fixes.

| Batch | Found by | Bug | Fix |
| --- | --- | --- | --- |
| 1 | B2 property test | The overall discount's last line took the other lines' rounding. On a bill whose overall discount covered nearly everything, with a small last line, that line's net went to −₹0.01, so its taxable value and GST went negative. | `computeInvoiceAmounts` now caps the last line's share at what it has left, and moves the excess back to the lines before it (`spillShareExcess`). Bills where the old rule held are unchanged. The counterexample is a regression case in `invoices.amounts.unit.test.ts`. |
| 2 | L1 race test | Two members claiming the same open lead at once both got 200: the claim read the lead, checked the hold, then wrote without a lock, so both saw an unheld lead and the second silently took it over. | `LeadsRepository.claim` makes the claim one guarded `UPDATE` (only while nobody else holds the lead). The loser re-reads and gets the 409 `lead_held`, as a later claim would. |

## Not code — left with their owners

| Task | Owner | Why it is not here |
| --- | --- | --- |
| M1 (templates approved), M2, L2 | Ops | Meta Business Manager and a test number |
| B1 (sign-off) | Clinic | The accountant's check of the worked examples |
| I1, I3 | Ops, Clinic | A real Anthropic key; the advisor's review of the summary |
| A1 | Ops | Needs S3 or MinIO; the Compose stack has neither |
| PL1, PL2 | Ops | Stripe test mode and a Resend sandbox |
| X1 | Code (clinozy-fe) | The frontend repository is outside this session |
| X3 | Ops | Deployment settings |
