# Launch confidence — tasks to raise the scores (2026-10-09)

Point-in-time snapshot after the launch iteration closed
([`iterations/launch-2026-09-30-jxmr/AS-BUILT.md`](../../iterations/launch-2026-09-30-jxmr/AS-BUILT.md)).
Each module has a confidence score: how sure we are that it does what the plan says. The scores
rest on the evidence at commit `a46b589`:

- the full `pnpm test` (708 + 62 + 26 + 136 + 93 + 10 files, all green);
- `pnpm test:rls-role` (159 files / 1,349 tests);
- route success coverage (436 / 436 routes);
- the contract lane (11 files / 53 tests);
- 2,413 live HTTP checks (`pnpm dev:checks`);
- SonarQube (0 issues).

This file lists what would raise each score, in the order that buys the most confidence first.

**Legend.** **Owner:** *Code* — a change in this repository; *Clinic* — the clinic's accountant or
advisor; *Ops* — accounts, keys and deployment settings outside the code. **Effort:** S — under a
day, M — one to three days, L — more than three days.

## Summary

| Module | Now | Target | Tasks |
| --- | --- | --- | --- |
| Messaging (WhatsApp, Instagram) and its notices | 72 | 88 | [M1–M5](#messaging--72--88) |
| Patient ideas (7.N) | 80 | 88 | [I1–I5](#patient-ideas--80--88) |
| Billing | 84 | 92 | [B1–B5](#billing--84--92) |
| Team (memberships, preferences, roles) | 87 | 92 | [T1–T3](#team--87--92) |
| Tasks and rules | 87 | 92 | [R1–R3](#tasks-and-rules--87--92) |
| Lead automation, team, photos, floor, purge | 87 | 91 | [A1–A3](#lead-automation-photos-purge--87--91) |
| Branches and places | 88 | 92 | [P1–P2](#branches-and-places--88--92) |
| Appointments | 88 | 92 | [AP1–AP3](#appointments--88--92) |
| Medical store | 88 | 92 | [MD1–MD3](#medical-store--88--92) |
| Contacts, contact activity, templates | 90 | 93 | [C1–C2](#contacts--90--93) |
| Patients (7.A–7.M) | 90 | 93 | [PT1–PT3](#patients--90--93) |
| Stock | 90 | 93 | [S1–S2](#stock--90--93) |
| End-to-end flows | 90 | 94 | [F1–F2](#end-to-end-flows--90--94) |
| Leads | 91 | 94 | [L1–L2](#leads--91--94) |
| Platform (auth, tenancy, Stripe billing, notify, uploads, audit) | 92 | 95 | [PL1–PL2](#platform--92--95) |
| Offerings | 93 | 95 | [O1](#offerings--93--95) |
| Tenant isolation (row-level security) | 95 | 97 | [RL1–RL2](#tenant-isolation--95--97) |
| **Overall** | **~88** | **~93** | plus the cross-cutting [X1–X6](#cross-cutting) |

## Do these first

The ten tasks that move the overall score most, in order:

1. **M1** — approved WhatsApp templates for the automated notices (Messaging +12).
2. **B1** — the accountant signs off D20, D21, D23 on worked examples (Billing +5).
3. **X1** — run clinozy-fe against this API; settle money in rupees vs paise (every module).
4. **X2** — k6 load scenarios for the app's busiest screens (every module).
5. **I1** — one run against Anthropic's real API with a test key (Patient ideas +4).
6. **M2** — a live run with Meta's test WhatsApp number and the webhook pointed at a test API.
7. **B2** — property tests on invoice totals: discounts, GST inside or on top, rounding, splits.
8. **X3** — the deployment settings below, so the worker boots and messaging reaches Meta.
9. **PT1** — a policy test pinning each role preset's clinical codes (P14).
10. **AP2 / S1 / MD2** — the concurrency races: one slot booked twice, one unit sold twice.

## Messaging — 72 → 88

The code works against a simulated Meta (65 assertions in `clinozy-messages`, the messaging
integration suite). The gap is Meta itself: WhatsApp refuses free text outside the 24-hour
customer-service window, so most automated notices — the confirm request, the reminder, the
receipt and the day-close summary — fail today. Each failure opens a call task (WC-4); nothing is
lost.

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| M1 | **Template messages (D32).** Add `sendWhatsAppTemplateMessage` to `src/infrastructure/messaging/meta-graph.client.ts`. Map each automated notice (`automation_kind`) to a template name, language and its parameters. The delivery worker sends the template when the contact's last inbound message is older than 24 hours, and free text otherwise. | Code + Ops (create the templates in Meta Business Manager and get them approved) | M | Unit and contract tests for the template body; the messaging integration suite covers inside and outside the window; the four notices deliver on the test number |
| M2 | **Live run.** Meta's test WhatsApp number plus a test Instagram account. Point the webhook at a test deployment, then send, receive a reply, and get the delivery report. | Ops + Code | S | One message of each kind delivered and its status moves `sent → delivered → read`; a reply joins the contact's stream |
| M3 | **Chaos test for the `meta` circuit.** Meta down: the queue pauses on every replica and the messages stay queued. Meta back: the first job probes and the queue resumes. | Code | S | A `*.chaos.test.ts` beside `circuit-breaker-contention.chaos.test.ts` |
| M4 | **Alert on failed notices.** A Sentry alert, or a metric, when the share of failed automated notices passes a threshold per organization per day. | Code + Ops | S | The alert fires in a staging test |
| M5 | **Opt-out.** Honour a contact's STOP reply for automated notices (Meta policy). Check it against D32 before building. | Code | S | A STOP reply stops automated sends to that number; covered in the integration suite |

## Patient ideas — 80 → 88

Built today (ROUTE #152, D80). Both the rules and the AI path are tested; Claude is simulated with
nock. `PATIENT_IDEAS_AI_ENABLED` is off by default.

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| I1 | **One real run.** A test `ANTHROPIC_API_KEY` on a staging stack with demo patients: let the sweep run once. | Ops + Code | S | The ideas are stored for consenting patients; `patient-ideas.completed` shows `unreadCount` 0 |
| I2 | **A small evaluation set.** About 20 de-identified summaries, each with the ideas a clinic counsellor would accept. Score parse rate, relevance and "never planned / never inactive". Re-run it when the prompt or the model changes. | Code + Clinic | M | A script prints the scores; the first run is recorded here |
| I3 | **Advisor review of what leaves the clinic** (D80 (4), PI6): concern labels, catalogue diagnoses, treatment names by month, packages, visit count, the plan and the menu. | Clinic | S | Written OK, or changes to the concern vocabulary (`PATIENT_IDEAS_CONCERN_LABELS`) |
| I4 | **A cost guard.** A per-organization daily cap on Claude calls (an env value), and a metric for refreshed / unread / superseded per run. | Code | S | Unit-tested cap; the metric is on the dashboard |
| I5 | **Chaos test for the `anthropic` circuit**, as M3. | Code | S | Chaos suite passes |

## Billing — 84 → 92

The code matches the plan: 295 assertions, 279 live checks, and the invoice-number fix
(9999 → 10000). The plan's tax rules are unconfirmed.

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| B1 | **Accountant sign-off on D20, D21, D23** — the discount before tax, GST included or on top, and numbering per GSTIN and financial year. Prepare five worked invoices from the test fixtures, each showing lines, discount, taxable value, CGST/SGST and total, for the accountant to check. | Clinic + Code (the examples) | S | Signed off, or the decision changed in a `fix` iteration |
| B2 | **Property tests on totals.** Use the existing `*.property.unit.test.ts` lane. For any set of lines, a discount, GST inside or on top, and a quantity: the lines add up to the total; the payment splits add up to the paid amount; rounding never drifts past one paisa per line. | Code | M | Property lane green with 1,000 runs per property |
| B3 | **Financial-year rollover.** An invoice on 31 March and the next on 1 April, per branch GSTIN, restarts the series (D23). | Code | S | Integration test |
| B4 | **Concurrency.** Two payments on one invoice at once must not overpay it; a day close while a payment is posting; two credit notes on one line. | Code | M | Integration tests with parallel requests |
| B5 | **Refund and reversal flow e2e** — refund, credit note, pending credit settled on the next bill. | Code | S | An e2e flow beside `flow-visit-to-payment` |

## Team — 87 → 92

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| T1 | **Extra roles end to end** — a member with Doctor + Pharmacist gets the union on every app section, and loses it at once when a role is removed (permission cache invalidation, WC-40). | Code | S | Integration test over five sections |
| T2 | **Preferences and saved views** — limits, a branch removed from a preference, saved views of a removed member. | Code | S | Integration cases |
| T3 | **The locked Admin role (D40)** cannot be edited or lose a code; Owner-only actions stay Owner-only. | Code | S | Integration cases |

Prefer integration tests to new curl checks: the live checks under `tooling/dev/live-api/` are
temporary (AS-BUILT › Follow-ups).

## Tasks and rules — 87 → 92

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| R1 | **Time boundaries** with a fake clock: a task due at 11:00 in the organization's time zone, the five-minute sweep at 10:58 and at 11:03, a snooze ending at midnight, a visit moved across a day. | Code | M | Unit tests on the rule conditions plus one integration case per rule family |
| R2 | **Sweep at scale.** 500 organizations with 50 open rules each; measure one sweep plus its jobs. | Code | S | Under the five-minute cron interval with margin, recorded here |
| R3 | **"Let Clinozy handle" steps** — each automatic step runs once even if two runs overlap. | Code | S | Integration test with two jobs |

## Lead automation, photos, purge — 87 → 91

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| A1 | **Photo location removal against real S3** (or MinIO): a phone JPEG with GPS, and a PNG with XMP. | Code | S | The contract or chaos lane reads the cleaned object back |
| A2 | **Purge with dependents.** A record deleted 8 days ago that a live record still points at (`RESTRICT`) is skipped and logged, not a failed job. | Code | S | Purge integration case |
| A3 | **Lead hold release** with a real scheduler tick, not only shifted clocks. | Code | S | Worker integration case |

## Branches and places — 88 → 92

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| P1 | **Holidays and rooms in booking** — a holiday closes slots; a room or machine removed while booked. | Code | S | Integration cases (shared with AP1) |
| P2 | **Branch access** — a member without access to a branch cannot read or write its records in any section. | Code | M | One integration case per section |

## Appointments — 88 → 92

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| AP1 | **Time zones and midnight** — bookings at 23:30 and 00:15 IST, an organization outside India, the slots on a branch holiday, and `daily-counts` at the day's edge. | Code | M | Integration cases |
| AP2 | **Double booking** — two bookings for the same doctor and slot at once: one wins, one gets 409. | Code | S | Parallel-request integration test |
| AP3 | **Status machine** — every allowed and refused move (booked → checked in → completed, cancel, reinstate, undo check-in) as a table-driven test. | Code | S | Unit test over the transition table |

## Medical store — 88 → 92

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| MD1 | **Earliest expiry first (MD5) with many batches** — partial batches, an expired batch skipped, near-expiry discounts. | Code | S | Unit tests on the batch picker plus one integration case |
| MD2 | **The last unit sold twice at once** — one sale wins, the other gets 409; stock never negative. | Code | S | Parallel-request integration test |
| MD3 | **Returns across batches**, and a void after a partial return. | Code | S | Integration cases |

## Contacts — 90 → 93

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| C1 | **Household phone numbers** — one number on two contacts of a household, a number moved between households, the primary number removed. | Code | S | Integration cases |
| C2 | **Activity stream at volume** — 5,000 entries on one contact; the list stays paginated and under its time budget. | Code | S | Performance-lane case |

## Patients — 90 → 93

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| PT1 | **Pin the clinical gates (P14, P23).** A policy test lists which preset roles hold `patient:clinical_record:read` and `patient:private_album:read`. A preset edit that grants them fails the test until the list is updated on purpose. | Code | S | Unit policy test |
| PT2 | **The last session spent twice** — a treatment and an invoice spend the same last session at once (the race named in AS-BUILT › Revisions). | Code | S | Parallel-request integration test |
| PT3 | **Prescription approval** — editing after approval, and approval by a role without the code. | Code | S | Integration cases |

## Stock — 90 → 93

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| S1 | **Concurrent movements on one item** — two issues at once never take stock below zero. | Code | S | Parallel-request integration test |
| S2 | **A count while movements post** — the count's variance uses the stock at its start. | Code | S | Integration case |

## End-to-end flows — 90 → 94

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| F1 | **Unhappy paths** — no-show and cancel; a refund and its credit note; a package that expires half used. | Code | M | Three e2e flows |
| F2 | **A day in the clinic** — one e2e from opening (day float) to the day close and its summary, across two branches. | Code | M | One e2e flow |

## Leads — 91 → 94

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| L1 | **Claim and release races** — two members claim one lead at once. | Code | S | Parallel-request integration test |
| L2 | **A new WhatsApp number becomes a lead** with a real Meta callback (with M2). | Ops + Code | S | Seen on the test number |

## Platform — 92 → 95

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| PL1 | **Stripe test mode** — signup, subscription, seat change and a webhook, against Stripe's test API rather than recorded fixtures. | Ops + Code | S | One recorded run (`contract-mode` recording) |
| PL2 | **Resend sandbox** — the invitation and verification mails delivered. | Ops | S | Delivered to a test inbox |

## Offerings — 93 → 95

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| O1 | **Offers at the edges** — an offer that expires mid-invoice, and an offer on an offering made inactive. | Code | S | Integration cases |

## Tenant isolation — 95 → 97

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| RL1 | **Run the unit-db lane as the RLS role too** — `pnpm test:rls-role` covers e2e and integration only. | Code | S | The lane passes as `clinozy_be_app` |
| RL2 | **Retention arms are read-only where they should be** — a test that the maintenance role cannot `UPDATE` app tables whose arm only serves a sweep's read (`app.patients`, D80). | Code | S | Security-lane test |

## Cross-cutting

| # | Task | Owner | Effort | Done when |
| --- | --- | --- | --- | --- |
| X1 | **clinozy-fe against this API.** Compare the Schema-routes hash (`pnpm iteration:list`, `5f90325208e1`) with clinozy-fe's. Settle the "Frontend adapts" list (AS-BUILT › Follow-ups) — money in rupees `numeric(12,2)` while clinozy-fe contracts hold paise — then run the frontend's flows. | Code (both repos) | L | Every frontend screen loads and saves against this API |
| X2 | **k6 load for the app.** No scenario under `src/tests/load/k6/scenarios/` hits `/app` yet. Add Today (appointments list and floor), the patient file (patient plus its nested lists), billing (an invoice plus a payment), with p95 targets. | Code | M | Three scenarios with thresholds; the first numbers recorded here |
| X3 | **Deployment settings.** `DATABASE_POOL_MAX=90` on the worker services (it refuses to boot below its demand, about 65 connections). Set the Meta secrets and the webhook URL (D77); turn `MESSAGING_DELIVERY_ENABLED` on. Leave `PATIENT_IDEAS_AI_ENABLED` off until I1 and I3. | Ops | S | `pnpm github:sync --check` is clean and the worker's `/readyz` answers 200 in each environment |
| X4 | **Monitoring.** Alerts for DLQ depth per app queue, `patient-ideas` and `contact-message-delivery` pauses, and day-close failures. | Code + Ops | S | Alerts defined and test-fired |
| X5 | **Index follow-ups** (AS-BUILT): list indexes all-ascending for backward scans, and drop the three membership indexes the composite foreign keys already cover. | Code | S | `be-sql-design-guard` clean; same plans in `EXPLAIN` |
| X6 | **Remove the temporary live checks** (`tooling/dev/live-api/`, `pnpm dev:fixture`, `pnpm dev:checks`) once their cases live in the suites. This does not raise a score, but it keeps one source of truth. | Code | S | The folder and its CLAUDE.md lines are gone, and the suites cover each check |

## How to use this file

The code tasks are planned and tracked in
[launch-confidence-plan-2026-10-09.md](launch-confidence-plan-2026-10-09.md).


Work the tasks as a `fix` or `feat` iteration (`pnpm iteration:new`), or as small PRs. When a task
is done, note it in the next confidence review — this file is a dated snapshot and is not
rewritten (see [docs/README.md](../README.md) › Reviews and audits).
