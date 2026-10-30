# feat-lead-follows-bookings-2026-10-30-ytqj — as built

Baseline: none · KICKOFF.md approved 2026-10-30 · run on, reviewed at Close (D19 — the user's "run on" answer, the
`/goal` equivalent: each row ends with its row here and a one-line report; open decisions are logged AMBER).

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit | Reviewed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `app.leads.closed_at`, its `CHECK`, the backfill, the seed writer | `migrations/20261030103639_leads_closed_at.sql`: the column, the backfill from `updated_at` inside a `NO FORCE` / `FORCE` RLS bracket, `chk_leads_closed_at` added `NOT VALID` then validated; `leads.schema.ts` mirrors it; `seedLead` stamps it; `LEAD_CLOSED_STATUS_VALUES`, `LEAD_WIN_BACK_STATUS_VALUES`, `LEAD_WIN_BACK_DAYS = 90`; the DBML regenerated | none | — | D7, D10, D13 | `10e0156` | at Close (run on) |
| R2 | §1 Leads — LF1–LF3 verify; LF4 stamping, LF5 output and export, LF6 the win-back write | LF1–LF3 checked against `6e92210` — as routes-final §1, no change. `closedAtAfter` in `leads.rules.ts` (create and status change); `markVisited` stamps `now()`; `closed_at` in `LeadOutput`, the serializer, the OpenAPI response map and its example; `LeadsRepository.winBack` — one guarded `UPDATE`; route descriptions (get, update) and `leads.overview.md` | the export column needed no code: the CSV takes the serializer's keys | the export is built from the output | D10, D11 | `ae65992` | at Close (run on) |
| R3 | §2 Appointments — AF1 verify + copy and restore; AF2 the win-back; AF3–AF5 | AF1 checked (`6e92210`): booking, cancel, no-show, delete, reinstate, restore and copy all move the lead (the copy case added). `convertAtCheckIn` converts the open lead, else `winBack` — the line "Won back: moved to Clinic visited at check-in"; the file this check-in opens links to the lead; an existing file keeps its link (D15). Check-in route description and `appointments.overview.md` | one path for the walk-in create and the check-in route (both call `convertAtCheckIn`) | no second rule to drift | D2, D3, D12, D14, D15 | `a40b320` | at Close (run on) |
| R4 | §3 Tasks — TF1 verify; a walk-in closes the reopened follow-up task | TF1 checked (`6e92210`): no task change — the rules run after the walk-in closes the `follow_up` task (TK4) because the lead is closed; proven by the walk-in-after-cancel case | no code | TK4 already closes a task whose lead no longer qualifies | — | `a40b320` (test) | at Close (run on) |
| R5 | Flow — booked, cancelled, walked in; a Lost lead won back; a walk-in with a later booking | `flow-enquiry-to-patient.2` and `.3` | the later booking is in case `.2` rather than its own case | one person's story covers both | — | `8018131` | at Close (run on) |

## Revisions to upcoming rows

None yet.

## Summary

(written at Close)

## Standing deviations

The complete list of where the code differs from the drop — empty for an initial iteration at the start.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
