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
| 8 — Housekeeping | X5, X6, X7 | The index follow-ups; the temporary live checks removed once the suites hold their cases; the product name out of hardcoded strings (the project-identity gate) |

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
| PT1 — clinical gates pinned | 3 | done | `app-role-presets.policy.unit.test.ts` (11 sensitive codes pinned; no preset deletes, manages the team or holds an unknown code; only Admin locked) |
| PT3 — prescription approval edges | 3 | done | approve again, change and delete after approval were already in `patients`; added: a role without the code is refused — `app-team-access.integration.test.ts` › T1, PT3 |
| T1 — extra roles end to end | 3 | done | `app-team-access.integration.test.ts` › T1 (the union, and refused at once when the role goes) |
| T2 — preferences and saved views | 3 | done | limits, other members' views and hidden branches were already in `memberships`; added: a branch taken away — after the fix below |
| T3 — the locked Admin role | 3 | done | `app-team-access.integration.test.ts` › T3 |
| P2 — branch access per section | 3 | done | `app-branch-access.integration.test.ts` (appointments, leads, invoices, payments, day closes, medical sales) |
| RL1 — unit-db lane as the RLS role | 3 | dropped (decision) | see Decisions |
| RL2 — read-only retention arm | 3 | done | `patients-ideas-sweep-read-only.security.test.ts` — after the fix below |
| AP1 — time zones and midnight | 4 | done | `record-fields.time-zone.unit.test.ts` (India across UTC midnight, UTC+14 vs UTC−11, a daylight-saving jump and its skipped hour, a round trip every 7 hours of a year in 6 zones) |
| P1 — holidays, rooms and machines in booking | 4 | done | `appointments-places.integration.test.ts` (a booked room or machine deleted: the booking stands, new and moved bookings refused until the place is cleared or restored; a holiday added after booking: the bookings stand, the day books nothing) |
| R1 — task rules at their due times | 4 | done | `task-rules-clock.integration.test.ts` — the organization's zone is the clock: a step due 11:00 run at 10:xx and 11:xx, arrive at 13 and 18 minutes past the start, a visit moved to tomorrow, a follow-up turning due at the organization's midnight, a snooze to midnight |
| R3 — overlapping rule runs | 4 | done | `task-rules-clock.integration.test.ts` › R3 × 2 — after the two fixes below |
| A2 — purge with dependents | 4 | done | `app-record-purge.integration.test.ts` › A2 (an offering on a live bill is skipped and counted; the rest of the batch is erased; the skipped one stays restorable) |
| A3 — lead hold release by the worker | 4 | done | `task-rules.worker.integration.test.ts` — the real sweep and task-rules workers on BullMQ, a three-second hold that runs out by waiting |
| S2 — a count while movements post | 4 | done | `app-races.integration.test.ts` › S2 (the count's difference is against the stock it found; the uses after it still count; the ledger adds up) |
| MD1 — earliest-expiry batches | 4 | done | `medicines.stock.unit.test.ts` (the picker) and `medical-batches.integration.test.ts` › MD1 (this month's batch first, the older batch on a tie, an expired batch neither sold nor counted, the near-expiry discount unless one is sent) |
| MD3 — returns across batches | 4 | done | `medical-batches.integration.test.ts` › MD3 (each line back into its own batch, a written-off return not restocked, no void after a partial return) |
| C1 — household numbers | 4 | done | shared numbers, leaving with one and the restore clash were already in `contacts`; added `contacts-household.integration.test.ts` (a move between households takes its numbers; refused while it carries the old household's shared number; the primary taken away frees the number) |
| O1 — offers at the edges | 4 | done | `offers-edges.integration.test.ts` (live on the first and last day, ended the day after, the status filter agrees; an offering made inactive under a live offer). The server applies no offer to a bill — a line carries its own discount — so an offer ending "mid-invoice" has no server path |
| M1 — WhatsApp templates (code part) | 5 | done | `sendWhatsAppTemplateMessage` (`meta-graph.contract.test.ts`); the notice templates and their texts in `whatsapp-notice-templates.ts` (`whatsapp-notice-templates.unit.test.ts`); the delivery worker's choice (`contact-message-delivery.processor.unit.test.ts`); inside and outside the window in `clinozy-messages.integration.test.ts` › D32. Ops: submit the six templates in Meta Business Manager, then set `WHATSAPP_TEMPLATES_ENABLED=true` |
| M3 — Meta outage pause | 5 | done | `provider-circuit-pause.chaos.test.ts` › M3 (two replicas, the real delivery job: the circuit opens on 503s, the queue pauses, the messages stay queued; back, the probe sends all) |
| M4 / X4 — failure metrics (code part) | 5 | done | `automated_notices_total{kind,outcome}` and `patient_ideas_results_total{outcome}`; per-organization counts on the `contact-message-delivery.completed` and `patient-ideas.completed` log lines; the alert rows in `docs/process/sentry-alerts.md` (app queue dead letters incl. day-close auto-close, provider pauses for `meta` / `anthropic`, notices failing, ideas capped) and `observability.md`. Ops: create the alerts in Sentry |
| M5 — STOP opt-out | 5 | done | `contacts.notices_stopped_at`; STOP / START replies (`contact-messaging-webhook.replies.unit.test.ts`, `messaging-webhook-event.processor.unit.test.ts`); no notice queued or sent while stopped (`contact-message-delivery.processor.unit.test.ts`, `clinozy-messages.integration.test.ts` › STOP) |
| I2 — ideas evaluation script | 5 | done (code part) | `pnpm tool:patient-ideas-eval` over 20 de-identified cases (`patient-ideas-eval.set.ts`), scored by `patient-ideas-eval.evaluate.ts` (`patient-ideas-eval.evaluate.unit.test.ts`). First run, `--oracle` (the harness itself): 20 cases, parse 100%, relevance 100%, first idea 100%, violations 0. The real run needs an Anthropic key (Ops, with I1) |
| I4 — daily cap on Claude calls | 5 | done | `PATIENT_IDEAS_DAILY_CALL_LIMIT` (default 500) through `reserveIdeasCall` (`patient-ideas.call-budget.unit.test.ts`); the refresh leaves capped patients marked (`patient-ideas.processor.unit.test.ts` › I4); `patient_ideas_results_total` |
| I5 — Anthropic outage pause | 5 | done | `provider-circuit-pause.chaos.test.ts` › I5 (the patient stays marked while Anthropic is down; back, the probe stores the ideas) |
| F1 — unhappy-path flows | 6 | planned | — |
| F2 — a day in the clinic | 6 | planned | — |
| C2 — the activity stream at volume | 7 | planned | — |
| R2 — the sweep at scale | 7 | planned | — |
| X2 — k6 scenarios for the app | 7 | planned | — |
| X5 — index follow-ups | 8 | planned | — |
| X6 — remove the temporary live checks | 8 | planned | — |
| X7 — the project-identity gate | 8 | planned | `pnpm tool:generate-project-identity:check` fails on the branch before this work: 95 hardcoded product-name mentions in the app domain, its locales and the live checks. Batch 5 adds none |

## Decisions

Taken by recommendation (no question asked), one line each, as the batches reach them.

| Batch | Decision | Why |
| --- | --- | --- |
| 3 | RL1 is dropped: the unit-db lane stays on the operator role. | Run as `clinozy_be_app`, 39 of its 62 files fail by design: they test repository SQL directly, without the database context a request or a job opens. Wrapping each would test the contexts, not the SQL. The RLS role already runs the e2e and integration lanes (1,349 tests), and the security lane probes every policy per role. |
| 3 | A member's saved branch filter lists only the branches they can see today. | A save already refuses a branch the member cannot see, so a read now drops one taken away since. The row is kept, so the branch comes back if access returns. |
| 4 | R1's clock is the organization's time zone, not a mocked `now()`. | The rules are SQL on the database's `now()`, which a test cannot move. A fixed-offset zone (`Etc/GMT±n`) whose wall clock reads the hour a case needs — 10:xx, 11:xx, 23:xx, 00:xx — moves the organization's day and hours exactly as time passing would, with no test hook in the code. |
| 4 | One task-rules run per organization at a time: a transaction-scoped advisory lock, `TASK_RULES_RUN` in the shared lock-space registry (`RESOURCE_QUOTA_LOCK_NAMESPACE`). | BullMQ's deduplication keeps one job per organization, but a stalled or retried job can run beside a fresh one. A second run waits, then sees the first one's work. Cheaper than a lock per step, and covers the notices (D78) too. |
| 4 | A task Clinozy closes by taking its step is marked `is_handled_by_clinozy` (a new column on `app.tasks`, folded into the baseline migration). | The rules must tell "Clinozy took the step" (keeps the rule quiet, like a person's resolution) from "the record changed" (a fresh task when it qualifies again). The label stays "Done by Clinozy" for both. |
| 4 | A3's hold is three seconds long and runs out by waiting. | A real lead hold is days. Three seconds keep the suite fast while the release still comes from the clock passing and the real workers, not from moving a timestamp. |
| 5 | A notice goes as its template only outside the person's 24-hour window (never wrote, or 24 hours or more ago); inside it, and for the team's own messages, free text. | The task as written. Free text keeps the richer wording where Meta allows it; the window is read when the message is sent, so it cannot close between queue and send. |
| 5 | Each notice stores its template parameters when it is queued (`contact_activities.template_parameters`); once sent as a template, the stream keeps the template's text. | The composers hold every value when they queue; reading them back at send time would repeat their logic. The stream shows what the person actually received. |
| 5 | Templates are behind one flag, `WHATSAPP_TEMPLATES_ENABLED`, off by default. | Templates must be approved in Meta Business Manager first; until then Meta refuses them, as it refuses free text outside the window. |
| 5 | The admins' day-close summary goes as its template whenever templates are on. | The admins' window is not known — they are members, not contacts. |
| 5 | STOP stops the automated notices and withdraws marketing consent; the team's own messages (one at a time or a batch) still go. START lifts it. Only a reply that is just the word counts. | Meta's opt-out policy covers business-initiated messages. A team member writing is a conversation; the stream's system entry tells them the person asked. "Please don't stop the treatment" must stop nothing. |
| 5 | The ideas' daily cap counts in Redis per organization per UTC day and fails closed. | No call goes out without a counted budget. If Redis is down the worker cannot run anyway. A patient left marked costs nothing: the rule-based ideas stay shown. |
| 5 | Notice failures are a bounded Prometheus counter, plus per-organization counts on the log line, rather than a new daily job. | A per-organization label would grow with the clinics. The log line carries the organization for a Sentry log alert, with no scheduler entry or pinned counts to change. |
| 5 | The chaos tests move the circuit's last failure a minute into the past instead of waiting out its 60-second reset window. | It is the same state every replica reads, in Redis. Waiting would add two minutes to the chaos lane and prove nothing more. |

## Findings

Bugs the new tests found, and their fixes.

| Batch | Found by | Bug | Fix |
| --- | --- | --- | --- |
| 1 | B2 property test | The overall discount's last line took the other lines' rounding. On a bill whose overall discount covered nearly everything, with a small last line, that line's net went to −₹0.01, so its taxable value and GST went negative. | `computeInvoiceAmounts` now caps the last line's share at what it has left, and moves the excess back to the lines before it (`spillShareExcess`). Bills where the old rule held are unchanged. The counterexample is a regression case in `invoices.amounts.unit.test.ts`. |
| 2 | L1 race test | Two members claiming the same open lead at once both got 200: the claim read the lead, checked the hold, then wrote without a lock, so both saw an unheld lead and the second silently took it over. | `LeadsRepository.claim` makes the claim one guarded `UPDATE` (only while nobody else holds the lead). The loser re-reads and gets the 409 `lead_held`, as a later claim would. |
| 3 | T2 test | A member moved off a branch still had it in their saved branch filter, although saving it again would be refused. | `MembershipPreferencesService` reads the filter through the member's visible branches (`listBranchPublicIds` takes them), on both the read and the save answer. |
| 3 | RL2 review | The retention arm added to `app.patients` for the ideas sweep (#152) sat on the `FOR ALL` policy. It let the maintenance role delete or change a patient file under the retention context, and patient files are never purged (P7). | The arm moved to its own `FOR SELECT` policy, `patients_ideas_sweep_read`, in the schema and the baseline migration. The security test proves read yes, update and delete no. |
| 4 | R3 overlap test | Two runs of one organization's task rules at once (a retried or stalled job beside a fresh one) both took the same due step: two payment reminders queued for one task. | `TaskRulesRepository.lockRun` — the run takes the organization's advisory lock first; the second run waits, then finds the step taken. |
| 4 | R3 repeat test | After Clinozy took a step ("Let Clinozy handle"), the next run opened a fresh task for the same, still-unpaid bill and sent the reminder again — every five minutes. The rule ignored tasks resolved automatically, so it could not tell a step taken from a record changed. Feedback requests repeated the same way; confirm and re-target tasks reopened and closed each run. | `closeTaskByClinozy` marks the task `is_handled_by_clinozy`; the rule's candidates treat it like a person's resolution. Three runs now queue one reminder. |

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
