# Brief — a bill line carries an optional free-text description

## What changes

A bill line (`invoice_items`) gets an optional free-text `description` of at most 280 characters,
next to its name. Clinics write things like "LHR Axilla 10 sessions =10*550" or "+2 sessions free"
on a line.

- The bill drawer (new bill, change a bill) lets the user type a description on each line; the
  bill and change previews take it too. A kept line keeps its description unless one is sent;
  `null` clears it.
- Every response that lists bill lines returns it: the bill (`GET`, create, change, restore),
  the bill list, the previews, and the medical sale lines.
- The bill view and the printed bill show the description under the line name.

## Why

Today the description has nowhere to live. In the Cresence import 884 line descriptions were packed
into the bill's remark (varchar 500, format "Lines — <name>: <description>"), and one bill's did not
fit and went into a note on the person. A per-line field puts the text where it belongs and lets a
later backfill move it back onto the lines.

## Affected screens, entities and routes

- Screens: the bill drawer (create / change), the bill view, the printed bill, the medical sale view
- Entities: invoice_items (+ `description`)
- Routes: `POST /app/invoices`, `PATCH /app/invoices/{invoice_id}`, `POST /app/invoices/preview`,
  `POST /app/invoices/{invoice_id}/preview` (accept `items[].description`); every route returning
  invoice lines (invoices, medical-sales) returns `items[].description`

## Rules

- `description` is optional, nullable, trimmed, 1–280 characters when sent as text; `null` clears it.
- On a change, a kept line (sent with its `id`) keeps its description when the field is omitted.
- A description never changes a line's amounts.
- Same permissions as the routes it rides on (`payment:create`, `payment:update`, `payment:read`,
  `medicine:read`).

## Acceptance criteria

- [ ] `invoice_items.description` exists, nullable, varchar(280); the migration lints clean.
- [ ] `POST /app/invoices` stores each line's description and returns it.
- [ ] `PATCH /app/invoices/{invoice_id}` keeps a kept line's description when omitted, replaces it when sent, clears it on `null`.
- [ ] Both preview routes echo each line's description.
- [ ] A description over 280 characters is a 400 on `items.N.description`.
- [ ] Medical sale lines return the description.
- [ ] The frontend bill drawer edits it, and the bill view and print show it under the line name.

## Out of scope

- The Cresence backfill moving descriptions out of the bills' remarks (a later change; the field
  only has to hold them — the longest fits in 280).
- Taking a description on `POST /app/medical-sales` (its lines are written from the medicine; a
  description can be added by changing the bill).
- Credit-note lines.
