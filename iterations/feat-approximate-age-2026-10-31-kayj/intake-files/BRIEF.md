# Brief — A contact can be registered with an age instead of a birth date, and the age keeps counting up

## What changes

- **Contact form (add / edit a contact or patient's person):** the desk either picks a birth date
  (as today) or types an age in whole years. A typed age is stored as an approximate birth date —
  the organization's today minus that many years — flagged approximate, so next year the same person
  reads one year older without anyone touching the record. Picking a real birth date later clears
  the flag.
- **Every response that shows a contact's birth date** also shows the current `age` (whole years,
  counted in the organization's time zone) and `date_of_birth_is_approximate`. On screen the age reads
  e.g. "34 y", with an "approx." mark when it came from a typed age.
- **Lists:** the contacts list, the patients list and the leads list filter by age — an age range
  — and the filter matches both real and approximate birth dates (both are dates).

## Why

Many patients at the front desk give only their age, not a birth date. Contacts hold only
`date_of_birth`, so the age goes into notes ("Age 34 when registered …") — in the Cresence import 29
patients had only an age. A note does not count up, cannot be searched and is not shown as an age.

## Affected screens, entities and routes

- Screens: the contact form (create / edit), the contact drawer and hover card, the contacts,
  patients and leads lists (filters)
- Entities: Contact (`app.contacts`) — gains `date_of_birth_is_approximate`
- Routes: `POST /app/contacts`, `PATCH /app/contacts/{contact_id}`, `GET /app/contacts`,
  `GET /app/contacts/{contact_id}` (and every route answering a Contact), `GET /app/patients`,
  `GET /app/leads` (and their exports, which share the list query)

## Rules

- Create and update take `age` (whole years, 0–120) as an alternative to `date_of_birth`; both in one
  body → 400 on `age`.
- `age` → `date_of_birth` = the organization's today minus `age` years (29 February → 28 February in
  a non-leap year) and `date_of_birth_is_approximate` = true.
- A sent `date_of_birth` (a date) sets `date_of_birth_is_approximate` = false; `date_of_birth: null`
  clears both.
- `date_of_birth_is_approximate` is boolean, NOT NULL, default false; it is true only with a birth
  date.
- `age` in a response = whole years between `date_of_birth` and the organization's today; `null`
  without a birth date.
- The age filters are inclusive whole-year bounds on that same age; a contact without a birth date
  never matches an age filter.
- Same permissions as today (`contact:create` / `contact:update` / `contact:read`, the patients' and
  leads' read gates).

## Acceptance criteria

- [ ] `POST /app/contacts` with `age: 34` stores `date_of_birth` = today − 34 years, answers
  `age: 34` and `date_of_birth_is_approximate: true`.
- [ ] `PATCH` with a `date_of_birth` turns the flag off; with `age` turns it on; `null` clears both.
- [ ] `age` and `date_of_birth` in one body → 400; `age` outside 0–120 or not whole → 400.
- [ ] Every Contact response (list, get, create, update, preview) carries `age` and
  `date_of_birth_is_approximate`.
- [ ] `GET /app/contacts`, `GET /app/patients` and `GET /app/leads` filter by an age range matching
  real and approximate birth dates alike.
- [ ] The frontend form lets the desk type an age or pick a date; the age shows as "34 y" with an
  "approx." mark; the lists carry the age filters.

## Out of scope

Moving the 29 Cresence ages out of notes (a later backfill — the fields support it: write
`date_of_birth` + `date_of_birth_is_approximate` directly). No new route, permission or background
work.
