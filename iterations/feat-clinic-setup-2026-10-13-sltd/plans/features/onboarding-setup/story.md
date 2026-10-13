Status: ready
Kind: screen
Depends on: first-branch-main

## Stories
- As a clinic owner I want the app to remember where I am in setup, on any device, so that I never answer twice.
- As an admin I want to go live only when the clinic can really book and bill, so that nobody meets a booking form that fails.
- As an owner I want a short guide that ticks itself from what I actually did, so that I can trust it and hide it.

## Rules
- Managers only, team clinics only (`access.setup-managers-only`, `access.setup-team-only`).
- Stored once per clinic; ticks read from records (`data.setup-progress`, `data.ticks-from-records`).
- Going live needs the clinic type, a main branch and a service (`operations.go-live`); changes merge (`quality.no-lost-answers`); safe to repeat (`quality.safe-to-repeat`).
- The guide's three items and their skips (`operations.guide-items`); "all done" recorded once (`operations.guide-done-once`).
- Existing ready clinics are live; who went live is kept (`data.existing-clinics-live`, `data.live-by-kept`); no float (`data.no-day-float`).

## Acceptance criteria
- The server refuses to complete setup while the clinic type, the main branch or a service is missing — intake-files/BRIEF.md:276
- A clinic that already had a main branch and a service before this shipped never sees the drawer or the ring — intake-files/BRIEF.md:275
- The three items tick from the clinic's real records — intake-files/BRIEF.md:269–270
- When the three are done or skipped, or the guide is hidden, the ring and the row go — intake-files/BRIEF.md:271–272
- A Front desk member never sees the drawer, the ring or the guide — intake-files/BRIEF.md:273–274

## Work items
- `data.setup-progress`, `data.ticks-from-records`, `data.existing-clinics-live`, `data.live-by-kept`, `data.no-day-float`,
  `access.setup-managers-only`, `access.setup-team-only`, `access.writes-keep-own-gates`, `operations.read-setup`,
  `operations.change-setup`, `operations.go-live`, `operations.guide-items`, `operations.guide-done-once`,
  `quality.safe-to-repeat`, `quality.no-lost-answers`, `quality.tenant-isolation`, `quality.status-read-cost`,
  `quality.errors-translated`, `background.none`
