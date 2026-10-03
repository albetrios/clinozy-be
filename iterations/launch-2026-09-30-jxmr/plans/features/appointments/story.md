# Appointments

Status: ready
Kind: screen
Depends on: team-and-access, patients, leads-and-messages
Tables: `branch_holiday`, `room`, `machine`, `appointment` — [db-changes.md](../../db-changes.md)

## Stories

- As Front desk I want to book, move and cancel appointments by doctor, room and machine so that the day runs on time.

## Rules

- A slot is free only when person, room and machine are free inside branch hours, outside holidays (`operations.appointments`)
- No-show is set by staff only after the start time (`operations.appointments`)
- Restore brings a cancelled visit back to Scheduled (`operations.appointments`)

## Acceptance criteria

- **appointments.1** The calendar shows agenda, day, week and month by doctor, room or machine — intake-files/PRD.md:57
- **appointments.2** A booking names patient or lead, service, doctor, room and machine, date, time and length inside branch hours and outside holidays — intake-files/PRD.md:135
- **appointments.3** The status moves Scheduled → Confirmed → Checked in → Completed; no-show only by staff after the start — intake-files/PRD.md:58
- **appointments.4** Reschedule, cancel with a reason, restore and copy work — intake-files/PRD.md:58
- **appointments.5** A confirm request goes out on booking and a reminder the day before; a "Yes" confirms — intake-files/PRD.md:234
- **appointments.6** A walk-in is booked at the current slot and checked in at once — intake-files/PRD.md:46

## Work items

- `data.stage-scheduling`
- `operations.appointments`
- `notifications.appointment-confirm`
- `notifications.appointment-reminder`
- `background.booking-confirm-request`
- `background.appointment-reminder`
- `background.reminder-rescheduling`
- `background.auto-confirm-on-reply`
