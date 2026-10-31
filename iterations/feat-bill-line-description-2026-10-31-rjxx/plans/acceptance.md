# feat-bill-line-description-2026-10-31-rjxx — acceptance

One row per acceptance criterion in `intake-files/BRIEF.md`. Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 `invoice_items.description` exists, nullable, varchar(280); the migration lints clean | BRIEF | pass | migration `20261031040323_invoice_items_description.sql`; `pnpm db:migrate:lint` 0 violations; DBML regenerated |
| A-2 `POST /app/invoices` stores each line's description and returns it | BRIEF | pass | `billing.integration.test.ts` › BD4 (created, read back, listed) |
| A-3 `PATCH /app/invoices/{invoice_id}` keeps a kept line's description when omitted, replaces it when sent, clears it on `null` | BRIEF | pass | `billing.integration.test.ts` › BD4 (kept on omit and on a header-only change, replaced, cleared by `null`) |
| A-4 Both preview routes echo each line's description | BRIEF | pass | `billing.integration.test.ts` › BD4 (`/invoices/preview` trims and echoes; `/invoices/{id}/preview` keeps + sets) |
| A-5 A description over 280 characters is a 400 on `items.N.description` | BRIEF | pass | `billing.integration.test.ts` › BD4 (`body.items/0/description` on 281 and on empty); `invoices.validator.unit.test.ts` (3/3) |
| A-6 Medical sale lines return the description | BRIEF | pass | `medical.integration.test.ts` › 11.H (sale lines return it — `null` unsent, the sent text on both batch lines, read back) — BD10 |
| A-7 The frontend bill drawer edits it; the bill view and print show it under the line name | BRIEF | open | clinozy-fe — BD7 (this session could not push to clinozy-fe) |
