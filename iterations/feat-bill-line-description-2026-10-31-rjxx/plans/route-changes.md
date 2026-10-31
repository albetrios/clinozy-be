# feat-bill-line-description-2026-10-31-rjxx — route changes

Iteration `feat-bill-line-description-2026-10-31-rjxx` · Baseline none · Intake mode `brief` · 2026-10-31.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Billing — invoices | 0 | 4 writes take it; every read returns it | 0 |
| Medical — medical sales | 0 | the create takes it (BD10); lines return it | 0 |

No method, path, access, status or idempotency changes (`docs/routes.txt` keeps its count).

| # | Change | Method | Path | Access | Operation | Built |
| --- | --- | --- | --- | --- | --- | --- |
| RC-1 | CHANGED — input + output | POST | `/api/v1/app/invoices` | `payment:create` | create a bill: `items[].description` | [AS-BUILT #1](../AS-BUILT.md) |
| RC-2 | CHANGED — input + output | PATCH | `/api/v1/app/invoices/{invoice_id}` | `payment:update` | change a bill: kept when omitted, `null` clears | [AS-BUILT #1](../AS-BUILT.md) |
| RC-3 | CHANGED — input + output | POST | `/api/v1/app/invoices/preview` | `payment:create` | preview: echoes it | [AS-BUILT #1](../AS-BUILT.md) |
| RC-4 | CHANGED — input + output | POST | `/api/v1/app/invoices/{invoice_id}/preview` | `payment:update` | change preview: echoes it (kept line's when omitted) | [AS-BUILT #1](../AS-BUILT.md) |
| RC-5 | CHANGED — output | GET | `/api/v1/app/invoices`, `/api/v1/app/invoices/{invoice_id}`, `POST …/restore` | `payment:read` / `payment:delete` | lines return it | [AS-BUILT #1](../AS-BUILT.md) |
| RC-7 | CHANGED — input + output | POST | `/api/v1/app/medical-sales` | `medicine:create` | sell: `items[].description`, on every drawn line (BD10) | [AS-BUILT #1](../AS-BUILT.md) |
| RC-6 | CHANGED — output | GET | `/api/v1/app/medical-sales`, `/api/v1/app/medical-sales/{medical_sale_id}` (+ the writes' responses) | `medicine:read` | lines return it | [AS-BUILT #1](../AS-BUILT.md) |

## Before → after

| # | What | Before | After | Why |
| --- | --- | --- | --- | --- |
| RC-1–4 | `items[]` request | no free text on a line | `description?: string(1–280) \| null` | BRIEF, BD4 |
| RC-1–6 | `items[]` response | — | `description: string \| null` | BRIEF |
