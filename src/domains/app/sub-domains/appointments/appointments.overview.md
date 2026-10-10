`src/domains/app/sub-domains/appointments/`

# Appointment

Parent: [app](../../app.overview.md)

## Purpose

One booking of a contact with a doctor, at a branch, in a room or on a machine — and, once they
arrive, its stage across the clinic floor (launch ROUTE #132 — routes-final §6). **The visit is not a
table of its own** (A10): the floor stage, its times and pause are columns of `app.appointments`,
set only while checked in; the visit's start is `checked_in_at`, its end `completed_at`. One folder,
no nested sub-domains (`visits/` went).

## Layout

| File | Role |
| --- | --- |
| `appointments.schema.ts` | `app.appointments` — the generated `time_range`, the CHECKs (status stamps, the floor stage only while checked in), indexes, RLS; the three `EXCLUDE` constraints live in the baseline migration only |
| `appointments.constants.ts` | types, statuses (slot-holding, movable), floor stages in order, cancel reasons, the length rules, the constraint → resource map |
| `appointments.{dto,validator,serializer,types}.ts` | request shapes (a booking or a walk-in; the copy's internal create), the list's `q` and inclusive day range, the response (`end_time`, the contact summary) |
| `appointments.rules.ts` | the slot rules (past, closed day, branch hours, doctor's days and hours), a room or machine of the same branch, the service label from the offering, walk-ins, moves, the lifecycle's own checks, the check-in conversion, the team on the contact, the `slots` and `daily-counts` reads |
| `appointments.repository.ts` | the shared app record layers on this table: sorts (`appointment_date`, `visit_stage_changed_at`, `created_at`), the `search` filter, a contact's last and next visit, the busy spans, the in-use read |
| `appointments.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–20 below: the transitions, the `slot_taken` mapping, copy through the create path |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/appointments` (and the floor: `status=checked_in`) | `appointment:read` |
| `GET /app/appointments/exports` | `appointment:export` (+ `appointment:read`) |
| `GET /app/appointments/slots` | `appointment:read` |
| `GET /app/appointments/daily-counts` | `appointment:read` |
| `POST /app/appointments` (a booking or a walk-in) | `appointment:create` |
| `GET /app/appointments/{appointment_id}` | `appointment:read` |
| `PATCH /app/appointments/{appointment_id}` | `appointment:update` |
| `DELETE /app/appointments/{appointment_id}` | `appointment:delete` |
| `POST /app/appointments/{appointment_id}/restore` | `appointment:delete` |
| `POST …/confirm`, `…/check-in`, `…/complete`, `…/no-show`, `…/cancel`, `…/reinstate`, `…/undo-check-in` | `appointment:update` |
| `POST …/copy` | `appointment:create` |
| `POST …/stage`, `…/pause`, `…/resume` | `appointment:update` |

## Key invariants

- **No double booking — the database's (A3):** `excl_appointments_doctor_time`, `_room_time` and
  `_machine_time` (`btree_gist` over the generated `time_range`) on live scheduled, confirmed,
  checked-in and completed bookings, walk-ins exempt; a clash is a 409 `slot_taken` naming the
  resource — on create, move, reinstate, copy and restore.
- **The slot rules (6.9):** a past start, a closed day (`branch_inactive`, `closed_day`, `holiday`,
  `doctor_off` — the doctor's days and hours, A4) and a time outside the branch's hours are 409s.
- **The lifecycle (A5):** `scheduled` → `confirmed` · `checked_in` · `cancelled` · `no_show`;
  `confirmed` → `checked_in` · `cancelled` · `no_show`; `checked_in` → `completed`; a move returns a
  confirmed booking to `scheduled`; `checked_in_at` / `completed_at` set exactly with their status.
- **The booking's messages (D34, D78):** the rules run queues the confirm request (WC-5,
  `confirm_requested`) and the day-before reminder (WC-6, `reminder_queued` → `reminder_sent`, or
  `failed`) when the clinic's WhatsApp is connected; a move and a reinstate start them over
  (`not_sent`, `is_confirmed_by_reply` false); a move, a cancel, a no-show, a reinstate or a delete
  stops the one still waiting (WC-7); a "Yes" on WhatsApp confirms the next asked booking (WC-8,
  `is_confirmed_by_reply`). A booking, a move, a status change (a confirm, a check-in, a cancel, a
  reinstate — D81 T7, WC-48) and a delete ask for the rules run after the commit, so the booking's
  task opens or closes at once.
- **The floor (A10, A11):** the stage exists only while checked in, moves forward only; pause and
  resume toggle `visit_paused_at`; undo check-in only while `waiting`.
- **Check-in converts (A14):** the contact's open lead moves to `clinic_visited` (with a `system`
  line in its stream) and a contact without a patient file gets one, in the check-in's transaction.
- **The contact (A1, CT7, CT11):** `ON DELETE RESTRICT` and a live booking blocks the contact's
  delete; the doctor and therapist handle the contact.
- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC with the retention-cleanup arm;
  branch visibility is the service's (D9).
