# KICKOFF — feat-lead-follows-bookings-2026-10-30-ytqj

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-lead-follows-bookings-2026-10-30-ytqj` (clinozy-be; the same-named clinozy-fe iteration builds the screens) |
| Mode | initial — Baseline `none` |
| Intake | Intake mode `brief` · Intake note "1 received (BRIEF.md) · from scratch" · Drop placed 2026-10-30 · Intake hash `5bae0977a19a` · Schema-routes — (no schema-routes in a brief from scratch) |
| Branch | `feat/lead-follows-bookings` — from `6e92210` (the first slice, D9) on `main` `f0975e7` |
| Date | 2026-10-30 |

## 2. Goal and scope

**Goal:** a lead follows its person's bookings, end to end — booked from the lead, Appointment scheduled while a visit is
to happen, back to Follow-up when the last one is cancelled, missed or removed, Clinic visited at any check-in — a walk-in
after a cancel included, winning back a lead closed as Lost or Not interested within 90 days — and the Progress track
reads at a glance.

**In scope (this repository):** the lead's booking status (built — verify), the close date, the win-back at check-in, the
lead moves on every booking write (built — verify, plus copy and restore), the follow-up task rule (built — verify), their
messages, tests and docs. **In scope (clinozy-fe):** Progress's five steps, booking from step 4, the booking still to
happen, the lighter done steps, the close date in Info, Start visit's heads-up.

**Out of scope** (BRIEF.md:149–156): undo check-in moving the lead back · cancelling or moving the other booking at a
walk-in (only a heads-up — D3) · a clinic setting for the 90 days · Invalid or a lead other than the latest (D14) ·
changing the patient follow-up rules · the demo seed · notifying anyone of a win-back (D12).

## 3. Locked decisions

| # | Summary |
| --- | --- |
| [D1](plans/decisions.md) | A booking step: Appointment scheduled while booked, Clinic visited at check-in, back to Follow-up when the booking is cancelled (not rescheduled) |
| [D2](plans/decisions.md) | A check-in wins back a lead closed Lost / Not interested within 90 days; Invalid never |
| [D3](plans/decisions.md) | A walk-in keeps another booking, with a heads-up after Start visit |
| [D4](plans/decisions.md), [D5](plans/decisions.md), [D8](plans/decisions.md) | A full `feat` iteration in both repositories, on `feat/lead-follows-bookings`, this one |
| [D6](plans/decisions.md) | Completed steps: a light tint of their own colour with a ✓; the current step strongest |
| [D7](plans/decisions.md), [D10](plans/decisions.md), [D11](plans/decisions.md) | A close date on the lead, stamped by every closing status, emptied on reopen, read-only output |
| [D12](plans/decisions.md) | Nobody is notified of a win-back — the stream line is the record |
| [D16](plans/decisions.md)–[D18](plans/decisions.md) | The route review is final: §1 Leads, §2 Appointments, §3 Tasks |

## 4. Features and order

1. [`lead-follows-bookings`](plans/features/lead-follows-bookings/story.md) — flow — the server keeps the lead in step with the bookings.
2. [`walk-in-after-cancel`](plans/features/walk-in-after-cancel/story.md) — flow — depends on 1: a check-in converts or wins back; the walk-in keeps other bookings.
3. [`lead-progress`](plans/features/lead-progress/story.md) — screen — clinozy-fe's; depends on 1 and 2.

## 5. ROUTE

Schema first, then the sub-domains in the route review's order, the background rule, the flow, acceptance. Rows marked
*verify* include code written before the iteration opened (D9): the row checks it against its route-review section,
fixes any difference, and records it in `AS-BUILT.md` with its commit.

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | The lead's close date — `app.leads.closed_at`, its `CHECK`, the backfill, the seed writer (routes-final §1.3 · LFC2, LFC6) — `data.lead-closed-at`, `quality.closed-at-held` | table | — | `/be-build-requirement` (CHANGE table): be-schema-generator → be-sql-design-guard → be-db-migration-maintainer → be-rls-tenant-isolation-guard → be-seed-maintainer | `quality.closed-at-held`; the migration applies, backfills and validates on a copy with closed leads | Claude | open |
| R2 | §1 Leads — LF1–LF3 *verify* (`6e92210`); LF4 stamping, LF5 output and export, LF6 the win-back write (routes-final §1 · LFC1, LFC3–LFC5, LFC7, LFC8) — `data.lead-status-booked`, `operations.lead-status-by-hand`, `operations.lead-follows-bookings` (LF3), `files.lead-export-closed-at`, `access.book-from-lead` (the gates as built — checked, no change), `quality.copy` | sub-domain | R1 | `/be-build-requirement`: be-api-contract-guard → be-route-schema-doc-guard → be-test-generator → be-i18n-message-guard → be-tsdoc-export-guard | A7, A8; `closed_at` on create / close / reopen; the export column | Claude | open |
| R3 | §2 Appointments — AF1 *verify* (`6e92210`) + copy and restore; AF2 the win-back at check-in; AF3–AF5 (routes-final §2 · AFC1–AFC4) — `operations.lead-follows-bookings`, `operations.check-in-converts`, `operations.check-in-wins-back`, `operations.walk-in-keeps-bookings`, `quality.stream-lines`, `quality.lead-moves-atomic` | sub-domain | R2 | `/be-build-requirement`: be-api-contract-guard → be-route-schema-doc-guard → be-test-generator | A1–A6, A10–A12 | Claude | open |
| R4 | §3 Tasks — TF1 *verify* (`6e92210`); a walk-in closes the reopened follow-up task (routes-final §3 · TFC1) — `background.follow-up-task` | background | R3 | `/be-build-requirement`: be-workers-events → be-test-generator | A4, A9, A10 | Claude | open |
| R5 | Flow — an enquiry booked, cancelled, then walked in; a Lost lead won back; a walk-in with a later booking (the enquiry flow e2e) | flow | R3, R4 | be-test-generator | A10, A11, A13 (the server's half) | Claude | open |
| R6 | Acceptance — A1–A13, A18 (the backend's half) traced with evidence; `plans/frontend-route-map.md`; the frontend's rows A14–A17 linked from its plan | acceptance | R1–R5 | be-kickoff-iteration › Close | A1–A18 | Claude | open |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.lead-status-booked`, `data.lead-closed-at` | [requirements/data.md](plans/requirements/data.md) |
| `access.book-from-lead` | [requirements/access.md](plans/requirements/access.md) |
| `operations.lead-follows-bookings`, `operations.lead-status-by-hand`, `operations.check-in-converts`, `operations.check-in-wins-back`, `operations.walk-in-keeps-bookings` | [requirements/operations.md](plans/requirements/operations.md) |
| `background.follow-up-task` | [requirements/background.md](plans/requirements/background.md) |
| `files.lead-export-closed-at` | [requirements/files.md](plans/requirements/files.md) |
| `quality.stream-lines`, `quality.copy`, `quality.lead-moves-atomic`, `quality.closed-at-held` | [requirements/quality.md](plans/requirements/quality.md) |
| notifications, realtime, integrations | n/a — [notifications.md](plans/requirements/notifications.md), [realtime.md](plans/requirements/realtime.md), [integrations.md](plans/requirements/integrations.md) |

## 7. Open AMBER items

| # | Safe default taken |
| --- | --- |
| [D9](plans/decisions.md) | The first slice (`6e92210`, `7febaec`) is verified at kickoff, not rebuilt |
| [D13](plans/decisions.md) | The close date is held by a database `CHECK` |
| [D14](plans/decisions.md) | The person's latest lead is the one a check-in may win back |
| [D15](plans/decisions.md) | An existing patient file keeps its link at a win-back |

## 8. Standing deviations

n/a — Baseline `none`: no earlier iteration's deviations apply. The launch's L8 ("`clinic_visited` is check-in's and
final") is kept; this iteration adds a second way to reach it (the win-back), still only at a check-in.

## 9. Definition of done

- Every ROUTE row `done` (or `deferred` with the user's OK), and the clinozy-fe iteration's rows done.
- `plans/acceptance.md` filled with evidence.
- `AS-BUILT.md` written — one row per ROUTE row, the summary (planned-not-built, built-not-planned, follow-ups) and its
  Standing deviations.
- The gates green: `pnpm validate`, `pnpm ci:local`, the iteration gate.

## 10. Verification

- The gates: `pnpm validate` · `pnpm ci:local` · `pnpm iteration:intake feat-lead-follows-bookings-2026-10-30-ytqj --check`.
- Intake mode `brief`: the `BRIEF.md` acceptance criteria (BRIEF.md:130–147) — A1–A18 in `plans/acceptance.md`, each with
  its test or screenshot.
- The existing end-to-end tests for everything touched: the enquiry flow (`flow-enquiry-to-patient`), the appointments
  lifecycle and lead-follows-bookings suites, the leads and tasks integration suites.
