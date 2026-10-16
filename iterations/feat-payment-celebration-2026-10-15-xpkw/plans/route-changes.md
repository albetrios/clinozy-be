# feat-payment-celebration-2026-10-15-xpkw — route changes

Iteration `feat-payment-celebration-2026-10-15-xpkw` · MODE initial (Baseline `none`, [PC1](decisions.md)) ·
Intake mode `full` · Intake hash `992289e86d52` · 2026-10-15.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Branches | 0 | 1 (output, additive) | 0 |

One route gains one response field; no route is added, removed, renamed or re-gated, and no status,
request body or idempotency rule moves ([PC6](decisions.md)). `docs/routes.txt` keeps its count.

## Branches

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-1 | CHANGED — each branch gains `review_link` | GET | `/api/v1/app/branches/my` | organization · read (every member; a `branch:read` holder gets every active branch) | list my branches | `schema-routes.md:27`; `PRD.md:21–25`; `BRIEF.md:39–41` | as proposed — `8dcb2f1` ([AS-BUILT #1](../AS-BUILT.md)) |

## Relied on, unchanged

The frontend's Payment received view calls these as they are today ([PC3](decisions.md)); listed so
the review sees every route the change touches.

| # | Method | Path | Access | Used for | Source |
| --- | --- | --- | --- | --- | --- |
| RU-1 | PATCH | `/api/v1/app/branches/{branch_id}` | branch · update | the Branch drawer saves `review_link` | `schema-routes.md:28` |
| RU-2 | GET | `/api/v1/app/patients/{patient_id}/reviews` | patient · read | the patient's previous reviews, "Reviewed on Google" | `schema-routes.md:29` |
| RU-3 | POST | `/api/v1/app/patients/{patient_id}/reviews` | patient review · create | Log a review | `schema-routes.md:30` |
| RU-4 | POST | `/api/v1/app/contacts/{contact_id}/activities/send-message` | contact activity · create | Send on WhatsApp (the Review message with the link, queued) | `schema-routes.md:31` |
| RU-5 | POST | `/api/v1/app/payments` | payment · create | the receipt that opens the view | `schema-routes.md:32` |
| RU-6 | POST | `/api/v1/app/invoices` | payment · create | an invoice with Paid now | `schema-routes.md:33` |
| RU-7 | POST | `/api/v1/app/pending-credits/{pending_credit_id}/settle` | payment · create | a credit got back | `schema-routes.md:34` |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-1 | `GET /api/v1/app/branches/my` | output | each branch: `id`, `name`, `tone`, `is_main`, the address (`address_line_one`, `address_line_two`, `area`, `city`, `state`, `postal_code`), `phone`, `gst_number`, `opens_at`, `closes_at`, `working_days` — the review link only for `branch:read` holders, through `GET /app/branches` | the same fields **and `review_link`** (`https://…` or `null`), for every member | PC4, PC5, PC6 |
