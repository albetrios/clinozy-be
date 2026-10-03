# Today and the visit

Status: ready
Kind: screen
Depends on: appointments, patient-file
Tables: `visit` — [db-changes.md](../../db-changes.md)

## Stories

- As Front desk I want to see the clinic floor right now so that every patient moves on.
- As a Doctor I want my queue and the Visit sheet so that I consult without hunting.

## Rules

- The server moves a card only when asked; completing the visit completes the appointment (`operations.today-floor`)
- Changes show within 60 seconds (`realtime.refresh-60s`)

## Acceptance criteria

- **today-floor.1** Today shows each visit in its lane (seven lanes) with time, service, doctor and plan flag — intake-files/PRD.md:45
- **today-floor.2** Check-in, stage moves, pause, resume and complete show for everyone within 60 seconds — intake-files/PRD.md:45
- **today-floor.3** Completing the visit completes the appointment and uses a package session — intake-files/PRD.md:46
- **today-floor.4** An approved prescription appears in the Pharmacy lane — intake-files/PRD.md:45

## Work items

- `operations.today-floor`
- `background.floor-live`
- `background.pharmacy-queue`
