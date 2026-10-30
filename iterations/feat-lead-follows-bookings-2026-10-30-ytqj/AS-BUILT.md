# feat-lead-follows-bookings-2026-10-30-ytqj — as built

Baseline: none · KICKOFF.md approved 2026-10-30 · run on, reviewed at Close (D19 — the user's "run on" answer, the
`/goal` equivalent: each row ends with its row here and a one-line report; open decisions are logged AMBER).

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit | Reviewed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `app.leads.closed_at`, its `CHECK`, the backfill, the seed writer | `migrations/20261030103639_leads_closed_at.sql`: the column, the backfill from `updated_at` inside a `NO FORCE` / `FORCE` RLS bracket, `chk_leads_closed_at` added `NOT VALID` then validated; `leads.schema.ts` mirrors it; `seedLead` stamps it; `LEAD_CLOSED_STATUS_VALUES`, `LEAD_WIN_BACK_STATUS_VALUES`, `LEAD_WIN_BACK_DAYS = 90`; the DBML regenerated | none | — | D7, D10, D13 | `10e0156` | the user, 2026-10-30 (Close) |
| R2 | §1 Leads — LF1–LF3 verify; LF4 stamping, LF5 output and export, LF6 the win-back write | LF1–LF3 checked against `6e92210` — as routes-final §1, no change. `closedAtAfter` in `leads.rules.ts` (create and status change); `markVisited` stamps `now()`; `closed_at` in `LeadOutput`, the serializer, the OpenAPI response map and its example; `LeadsRepository.winBack` — one guarded `UPDATE`; route descriptions (get, update) and `leads.overview.md` | the export column needed no code: the CSV takes the serializer's keys | the export is built from the output | D10, D11 | `ae65992` | the user, 2026-10-30 (Close) |
| R3 | §2 Appointments — AF1 verify + copy and restore; AF2 the win-back; AF3–AF5 | AF1 checked (`6e92210`): booking, cancel, no-show, delete, reinstate, restore and copy all move the lead (the copy case added). `convertAtCheckIn` converts the open lead, else `winBack` — the line "Won back: moved to Clinic visited at check-in"; the file this check-in opens links to the lead; an existing file keeps its link (D15). Check-in route description and `appointments.overview.md` | one path for the walk-in create and the check-in route (both call `convertAtCheckIn`) | no second rule to drift | D2, D3, D12, D14, D15 | `a40b320` | the user, 2026-10-30 (Close) |
| R4 | §3 Tasks — TF1 verify; a walk-in closes the reopened follow-up task | TF1 checked (`6e92210`): no task change — the rules run after the walk-in closes the `follow_up` task (TK4) because the lead is closed; proven by the walk-in-after-cancel case | no code | TK4 already closes a task whose lead no longer qualifies | — | `a40b320` (test) | the user, 2026-10-30 (Close) |
| R5 | Flow — booked, cancelled, walked in; a Lost lead won back; a walk-in with a later booking | `flow-enquiry-to-patient.2` and `.3` | the later booking is in case `.2` rather than its own case | one person's story covers both | — | `8018131` | the user, 2026-10-30 (Close) |
| R6 | Acceptance — A1–A13, A18 traced; `plans/frontend-route-map.md`; the frontend's A14–A17 linked | `plans/acceptance.md` filled (18 rows, each with its test); the route map's sections 1, 2 and 4 by hand, 3 generated and checked | none | — | — | (the Close commit) | the user, 2026-10-30 (Close) |
| R7 | — (D20: the redesign approved at the user's review) | `followUpRule` due at `leads.follow_up_at` instead of 11:00 that day; `rebookRule` skips a contact with an open lead; tests: the due time (task-rules-clock) and a no-show opening the follow-up task only, Rebook once the lead is closed | built-not-planned | the approved Next step design sets a follow-up time; one person, one task | D20 | `d71f949` | the user, 2026-10-30 (design approved) |

## Revisions to upcoming rows

- **D20 (scope change, approved by the user):** at the review of the built drawer the user approved a redesign of the lead
  drawer's Progress (the Next step card, a follow-up time, saving at once). Its server part became R7 here; its screens
  became F7 in clinozy-fe.

## Summary

- **Planned and built:** R1–R6 — the close date, the lead that follows the bookings (verified), the win-back at check-in,
  walk-ins keeping other bookings, the flow tests, acceptance.
- **Built, not planned:** R7 (D20) — the follow-up task due at its own time; Rebook only without an open lead.
- **Planned, not built:** none.
- **Gates:** `pnpm validate`, the related suites (unit 6,196 · global 142 · 638 integration in 48 files, the
  lead-follows-bookings, leads, tasks and enquiry-flow suites), `pnpm iteration:frontend-map --check`; the full
  `pnpm ci:local` runs on the PR.
- **Follow-ups:** none required. Possible: a stream line when a follow-up time is set by hand (the design showed one;
  not built — the toast and Info carry it).

## Standing deviations

The complete list of where the code differs from the brief and the approved design.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
| A follow-up set by hand | the design's chat showed a stream line "Follow-up set · <time>" | no stream line; the move's toast and the lead's Info carry it | feat-lead-follows-bookings-2026-10-30-ytqj | D20 |
