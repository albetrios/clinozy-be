Status: ready
Kind: flow
Depends on: lead-follows-bookings

## Stories
- As a front-desk member I want a person who cancelled and then walks in to count as the enquiry's visit so that the source that brought them gets the credit and nobody keeps chasing them.
- As a marketing member I want a lead closed as Lost or Not interested to be won back when the person comes within 90 days so that the enquiry's outcome is true.
- As a front-desk member I want to be told when a walk-in still has another booking so that I keep or cancel it on purpose.

## Rules
- A check-in converts the open lead first (`operations.check-in-converts`).
- With no open lead, the latest lead closed Lost / Not interested within 90 days is won back; Invalid, older or none — nothing (`operations.check-in-wins-back`).
- The close date says when a lead closed, held by the database (`data.lead-closed-at`, `quality.closed-at-held`).
- A walk-in never touches another booking; the desk sees it after Start visit (`operations.walk-in-keeps-bookings`).
- Nobody is notified of a win-back; the stream line is the record (`quality.stream-lines`).

## Acceptance criteria
- A walk-in after a cancel ends the open lead in Clinic visited, closes its follow-up task and links the new patient file to it — intake-files/BRIEF.md:139
- A walk-in (or check-in) of a person whose latest lead was closed Lost or Not interested within 90 days wins it back to Clinic visited, with "Won back at check-in" in the stream, linked to the patient file — intake-files/BRIEF.md:140
- A lead closed as Invalid, or closed more than 90 days ago, stays closed at a check-in — intake-files/BRIEF.md:141
- A walk-in with another booking still to happen keeps that booking, and Start visit shows "Also booked · <day> · <time>" with Open — intake-files/BRIEF.md:142

## Work items
- `operations.check-in-converts`, `operations.check-in-wins-back`, `operations.walk-in-keeps-bookings`, `data.lead-closed-at`, `quality.closed-at-held`, `files.lead-export-closed-at`
