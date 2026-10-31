# Clinozy API — final routes, sub-domain by sub-domain (feat-approximate-age-2026-10-31-kayj)

Started from `origin/main` on branch `feat/approximate-age`. Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md).

**How to read the tables:** paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contacts — age instead of a birth date; age filters on the people lists | `contacts/` (+ `patients/`, `leads/` list queries) | `contacts`, `contacts/{contact_id}`, `patients`, `leads` | 0 new, 9 changed (additive) | tenancy (organization time zone) | **final (rev 1, confirmed 2026-10-31)** — [AA11](decisions.md) |

App total: **0 routes added, 0 removed**; `docs/routes.txt` keeps its count.

## Rules for every sub-domain

| # | Rule |
| --- | --- |
| K1 | Additive on `v1`: request bodies gain an optional field, queries gain optional filters, responses gain fields. |
| K2 | "Today" is the organization's today (its time zone) for the typed age, the response `age` and the filters. |

---

## 1. Contacts — age instead of a birth date — final (rev 1, confirmed 2026-10-31)

### 1.1 Decisions

| # | Decision |
| --- | --- |
| AG1 | `age` (integer 0–120) on create/update is an alternative to `date_of_birth`; both → 400 on `age` (`errors:validation.contactAgeOrDateOfBirth`). |
| AG2 | `age` → `date_of_birth` = organization's today − `age` years (never after the database's today, [AA8](decisions.md)), `date_of_birth_is_approximate` = true. A sent `date_of_birth` → flag false; `null` → both cleared. |
| AG3 | Every Contact response gains `age` (integer or null — whole years to the organization's today) and `date_of_birth_is_approximate` (boolean). |
| AG4 | `age_from` / `age_to` (integers 0–120, inclusive) on the contacts, patients and leads lists ([AA4](decisions.md), [AA5](decisions.md)); a person without a birth date never matches. |

### 1.2 Open questions

None.

### 1.3 Tables and relations

`app.contacts` gains `date_of_birth_is_approximate` — [db-changes.md](db-changes.md).

### 1.4 Permissions

Unchanged: `contact:create`, `contact:update`, `contact:read`; the patients' and leads' list gates.

### 1.7 Routes

| # | Method | Path | Gate | Idem | Change |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/contacts` | `contact:read` | — | `age_from`, `age_to`; items + `age`, `date_of_birth_is_approximate` |
| 2 | POST | `/contacts` | `contact:create` | as today | body + `age`; answer + the two fields |
| 3 | PATCH | `/contacts/{contact_id}` | `contact:update` | as today | body + `age`; answer + the two fields |
| 4 | GET | `/contacts/{contact_id}` (+ preview, delete, restore answers) | as today | as today | answer + the two fields |
| 5 | GET | `/patients` (+ `/exports`) | as today | — | `age_from`, `age_to` |
| 6 | GET | `/leads` (+ `/exports`) | as today | — | `age_from`, `age_to` |

### 1.9 Errors

400 — `age` with `date_of_birth`; `age` not an integer 0–120; `age_from`/`age_to` not an integer 0–120.

### 1.11 Code changes

| # | Change |
| --- | --- |
| AGC1 | Schema + migration: `date_of_birth_is_approximate`, `chk_contacts_date_of_birth_approximate`. |
| AGC2 | DTO/validator: `age` on create/update, the both-at-once refusal; `age_from`/`age_to` on the three list queries. |
| AGC3 | Rules: the typed age → approximate date + flag; a real date → flag false. Decorate: `age` from the organization's today. |
| AGC4 | Repository: the age condition (shared by the three lists). Serializer/types/OpenAPI/i18n/tests/overview. |

### 1.12 Nested sub-domains

None touched.

**Route review final — 2026-10-31.** Every sub-domain is confirmed; the frontend may kick off on these routes.
