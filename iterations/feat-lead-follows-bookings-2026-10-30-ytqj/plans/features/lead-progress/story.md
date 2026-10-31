Status: ready
Kind: screen
Depends on: lead-follows-bookings (the statuses), walk-in-after-cancel (the close date)

The screen is **clinozy-fe's** — its same-named iteration plans and builds it against this plan's contract
(`routes-final.md`). Listed here so the coverage rows have their feature.

## Stories
- As a front-desk member I want to book from the lead's Progress so that I never leave the lead to book its person.
- As a front-desk member I want to see the booking still to happen on the lead, with Reschedule and Cancel, so that I manage the visit where I work the lead.
- As anyone reading a lead I want completed steps to read as done at a glance so that I see where the lead stands.

## Rules
- Step 4 books for a member who books; not on a closed lead (`access.book-from-lead`).
- While booked the earlier steps and No response wait for the cancel (`operations.lead-status-by-hand`).
- Completed steps: a light tint of their own colour with a ✓; the current step strongest (D6).
- A closed lead shows when it closed (`data.lead-closed-at`, D11).

## Acceptance criteria
- In the lead drawer, step 4 reads "Book" for a member who books and opens the booking form on the person; it is not pressable without the right or on a closed lead — intake-files/BRIEF.md:143
- The booking still to happen shows on Progress with Reschedule and Cancel appointment for Appointments › Edit — intake-files/BRIEF.md:144
- While booked, the earlier steps and No response are not pressable and say why — intake-files/BRIEF.md:145
- Completed steps read lighter than the current step, with a check, in both themes; the phone shows the steps as a list without mid-word breaks — intake-files/BRIEF.md:146
- Every label is translated in the frontend's eleven locales and the backend's two — intake-files/BRIEF.md:147

## Work items
- `access.book-from-lead`, `operations.lead-status-by-hand`, `data.lead-closed-at`, `quality.copy` (the frontend's screens)
