# feat-approximate-age-2026-10-31-kayj — route changes

Iteration `feat-approximate-age-2026-10-31-kayj` · Intake hash `1ece1c50c902` · 2026-10-31.

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 0 | 9 | 0 |

All additive on `v1`; no gate, status or idempotency change. Detail: [routes-final.md § 1](routes-final.md).

| Route | Before | After |
| --- | --- | --- |
| `POST /app/contacts` | `date_of_birth` | `date_of_birth` **or** `age` (0–120; both → 400); answers `age`, `date_of_birth_is_approximate` |
| `PATCH /app/contacts/{contact_id}` | `date_of_birth` | same as create; `date_of_birth` turns the flag off, `age` on, `null` clears both |
| `GET /app/contacts` | — | `age_from`, `age_to`; each contact carries `age`, `date_of_birth_is_approximate` |
| `GET /app/contacts/{contact_id}`, `…/preview`, `DELETE`/restore answers | Contact | Contact + `age`, `date_of_birth_is_approximate` |
| `GET /app/patients`, `GET /app/patients/exports` | — | `age_from`, `age_to` (the patient's contact) |
| `GET /app/leads`, `GET /app/leads/exports` | — | `age_from`, `age_to` (the lead's contact) |
