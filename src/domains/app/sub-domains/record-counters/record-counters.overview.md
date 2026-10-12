# record-counters

`app.record_counters` — the running-number counters (no routes). One row per organization and
counter: `<table>.<column>` for the "#12" numbers (`app.fn_assign_record_number`) and
`invoices:<branch_id>:<financial year>` for the GST invoice number `2026-27/0042`
(`app.fn_assign_invoice_number`, D23). A counter only grows, so a purged record never gives its
number back (schema review H7).
