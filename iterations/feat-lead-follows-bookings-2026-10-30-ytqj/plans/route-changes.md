# Route changes — feat-lead-follows-bookings-2026-10-30-ytqj

The iteration's proposed routes, in one file (`be-iteration-planning` › Route changes). Proposals only —
kickoff confirms each route when it builds it and records any change in `AS-BUILT.md`; the built truth is
`docs/routes.txt`.

Status: **Step 5, 2026-10-30** — matched to the route review, final (D16–D18); D10–D15 applied. Mode initial (Baseline `none`) · Intake mode `brief` · Intake hash
`5bae0977a19a`. **No route is added or removed** (BRIEF.md:102–105): every change is behaviour on a route
that exists. **Change** is against the code as built: `CHANGED` (its behaviour or output changes) ·
`REUSED` (the same route as built, called by this change — no change).

## Counts

Counted by route (RC-4 and RC-7–RC-11 group several routes in one row).

| Area | NEW | CHANGED | REUSED | Total |
| --- | --- | --- | --- | --- |
| Leads | 0 | 6 | 0 | 6 |
| Appointments | 0 | 8 | 3 | 11 |
| **Total** | **0** | **14** | **3** | **17** |

## Leads (app domain, sub-domain `leads`)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-1 | CHANGED | POST | `/api/v1/app/leads` | lead · create | a new lead — never in Appointment scheduled by hand; starts in it for a booked person | BRIEF.md:63–66 |
| RC-2 | CHANGED | PATCH | `/api/v1/app/leads/{lead_id}` | lead · update | change a lead — Appointment scheduled never set by hand; left by hand only for a closing status while booked; reopened while booked → Appointment scheduled; a close stamps the close date, a reopen empties it | BRIEF.md:63–66, 115–117; D7 |
| RC-3 | CHANGED | POST | `/api/v1/app/leads/{lead_id}/restore` | lead · delete | undo a delete — a booked person's open lead comes back in Appointment scheduled | BRIEF.md:65–66 |
| RC-4 | CHANGED | GET | `/api/v1/app/leads`, `/api/v1/app/leads/{lead_id}`, `/api/v1/app/leads/exports` | lead · read (exports: lead · export) | the lead's output — `status` may read `appointment_scheduled`; `closed_at` read-only (D11) | BRIEF.md:52, 101 |

## Appointments (app domain, sub-domain `appointments`)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-5 | CHANGED | POST | `/api/v1/app/appointments` | appointment · create | a booking moves the open lead to Appointment scheduled; a walk-in converts at its check-in — the open lead, else a lead won back | BRIEF.md:56–57, 72–79 |
| RC-6 | CHANGED | POST | `/api/v1/app/appointments/{appointment_id}/check-in` | appointment · update | the check-in converts — the open lead, else a lead won back (D2) | BRIEF.md:62, 78, 118–120 |
| RC-7 | CHANGED | POST | `/api/v1/app/appointments/{appointment_id}/cancel` | appointment · update | the last booking still to happen cancelled → the lead to Follow-up, dated now | BRIEF.md:59–61 |
| RC-8 | CHANGED | POST | `/api/v1/app/appointments/{appointment_id}/no-show` | appointment · update | the same for a no-show | BRIEF.md:59–61 |
| RC-9 | CHANGED | DELETE | `/api/v1/app/appointments/{appointment_id}` | appointment · delete | the same for a removal | BRIEF.md:59–61 |
| RC-10 | CHANGED | POST | `/api/v1/app/appointments/{appointment_id}/reinstate` | appointment · update | the lead to Appointment scheduled again | BRIEF.md:61 |
| RC-11 | CHANGED | POST | `/api/v1/app/appointments/{appointment_id}/restore` | appointment · delete | the lead to Appointment scheduled again | BRIEF.md:61 |
| RC-15 | CHANGED | POST | `/api/v1/app/appointments/{appointment_id}/copy` | appointment · create | a copy or rebook books — the open lead to Appointment scheduled | BRIEF.md:56–57 |
| RC-12 | REUSED | PATCH | `/api/v1/app/appointments/{appointment_id}` | appointment · update | a reschedule keeps the booking — the lead stays (no change) | BRIEF.md:58 |
| RC-13 | REUSED | POST | `/api/v1/app/appointments/{appointment_id}/confirm` | appointment · update | a confirm keeps the booking — the lead stays (no change) | BRIEF.md:58 |
| RC-14 | REUSED | GET | `/api/v1/app/appointments?contact_id=` | appointment · read | the person's bookings — Progress's booking still to happen and Start visit's heads-up read it (no change) | BRIEF.md:41–43, 84–86 |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-1 | `POST /api/v1/app/leads` | behaviour | a new lead starts in the status sent (`new` by default) | a new lead for a person with a booking still to happen starts in `appointment_scheduled`; sending `appointment_scheduled` is refused (409 `lead_status_by_booking`) | D1 |
| RC-2 | `PATCH /api/v1/app/leads/{lead_id}` | behaviour | any status but `clinic_visited` may follow any | `appointment_scheduled` is refused by hand; while booked a lead leaves it only for `not_interested` / `invalid` / `lost` (409 `lead_status_by_booking`); a reopen while booked answers in `appointment_scheduled`; a close stamps `closed_at`, a reopen empties it | D1, D10 |
| RC-3 | `POST /api/v1/app/leads/{lead_id}/restore` | behaviour | the lead comes back as it was | an open lead of a booked person comes back in `appointment_scheduled` | D1 |
| RC-4 | `GET /api/v1/app/leads` (+ one, exports) | output | 8 statuses; no close date | 9 statuses; `closed_at`, read-only — set exactly when the lead is closed | D1, D10, D11 |
| RC-5 | `POST /api/v1/app/appointments` | behaviour | a booking leaves the lead as it is; a walk-in converts only an open lead | a booking moves the open lead to `appointment_scheduled` (a stream line); a walk-in converts the open lead, else wins back the latest `lost` / `not_interested` lead closed ≤ 90 days ago | D1, D2 |
| RC-6 | `POST …/{appointment_id}/check-in` | behaviour | converts only an open lead; else the file opens unlinked | converts the open lead, else wins back the person's latest lead if `lost` / `not_interested` closed ≤ 90 days ago ("Won back: moved to Clinic visited at check-in"), a file this check-in opens linked to it; nobody notified | D2, D12, D14, D15 |
| RC-15 | `POST …/{appointment_id}/copy` | behaviour | a copy leaves the lead as it is | the open lead → `appointment_scheduled`, a stream line | D1 |
| RC-7–RC-9 | `…/cancel`, `…/no-show`, `DELETE …` | behaviour | the lead is untouched | when no booking is left to happen, the lead in `appointment_scheduled` goes back to `follow_up`, its follow-up date now, a stream line naming why | D1 |
| RC-10–RC-11 | `…/reinstate`, `…/restore` | behaviour | the lead is untouched | the open lead goes to `appointment_scheduled` again | D1 |
