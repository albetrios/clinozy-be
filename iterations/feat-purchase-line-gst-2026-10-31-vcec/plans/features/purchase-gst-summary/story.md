Status: ready
Kind: screen
Depends on: purchase-line-gst

## Stories
- As the owner I want one month's purchase GST by rate and by HSN code so that I can file returns and claim input tax credit.
- As the owner I want it as a CSV so that my accountant can use it.

## Rules
- Received, live orders whose receive date (organization time zone) is in the month; received lines only (PG11).
- Gates as the purchase list and its CSV (`access.purchase-gst-summary`).

## Acceptance criteria
- A-6, A-7, A-8 — intake-files/BRIEF.md:67–69

## Work items
- `operations.purchase-gst-summary`, `operations.purchase-gst-summary-export`, `access.purchase-gst-summary`, `files.purchase-gst-summary-csv`, `quality.summary-indexed`
