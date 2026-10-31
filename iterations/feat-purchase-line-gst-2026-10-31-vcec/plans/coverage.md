# feat-purchase-line-gst-2026-10-31-vcec — coverage

## Coverage

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| `BRIEF.md:17–22` | GST on each purchase line, invoice calculation | `data.purchase-line-gst`, `quality.one-gst-calculation` | purchase-line-gst | A-1, A-2 | covered |
| `BRIEF.md:18–19`, `:52` | defaults: medicine's rate, inclusive | `operations.purchase-line-gst-input` | purchase-line-gst | A-3 | covered |
| `BRIEF.md:23`, `:54` | order totals | `data.purchase-order-gst-totals` | purchase-line-gst | A-4 | covered |
| `BRIEF.md:24–27` | monthly summary by rate and HSN | `operations.purchase-gst-summary` | purchase-gst-summary | A-6 | covered |
| `BRIEF.md:27`, `:47` | the CSV | `operations.purchase-gst-summary-export`, `files.purchase-gst-summary-csv` | purchase-gst-summary | A-7 | covered |
| `BRIEF.md:29–31` | frontend screens | — (clinozy-fe) | both | A-8 | covered ([PG16](decisions.md)) |
| `BRIEF.md:51` | 0 % = without GST bill | `operations.purchase-line-gst-input` | purchase-line-gst | A-3 | covered ([PG6](decisions.md)) |
| `BRIEF.md:55–56` | fill existing rows | `data.purchase-gst-backfill` | purchase-line-gst | A-5 | covered |
| `BRIEF.md:57–58` | received live orders; gates | `access.purchase-gst-summary` | purchase-gst-summary | A-6, A-7 | covered |
| `BRIEF.md:73–74` | supplier GSTIN, GSTR formats, reverse charge, cess, discounts, short deliveries | — | — | — | out-of-scope ([PG14](decisions.md)) |

## Reconciliation

Brief mode from scratch — no `PRD.md` / `schema-routes.md` to reconcile.

## Delta

Initial (Baseline `none`) — the whole brief is the delta.
