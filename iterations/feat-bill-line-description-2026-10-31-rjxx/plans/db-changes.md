# feat-bill-line-description-2026-10-31-rjxx — database changes

Iteration `feat-bill-line-description-2026-10-31-rjxx` · Baseline none · Intake mode `brief` · 2026-10-31.

| Table | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| `app.invoice_items` | — | + `description` | — |

## Before → after

| # | Table | Column | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| DB-1 | `app.invoice_items` | `description` | — | `varchar(280) NULL` — the line's free text, printed under its name | BRIEF, BD1, BD3 |

```text
app.invoice_items
  name         varchar(120) NOT NULL   (snapshot)
+ description  varchar(280) NULL       (typed on the line; kept on a change unless sent)
  pack_size    varchar(30)  NULL
```

RLS: the table is already FORCE RLS with its organization policy; a new column changes nothing
(be-rls-tenant-isolation-guard). Migration: one `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, no data
movement — the Cresence backfill is a later change.
