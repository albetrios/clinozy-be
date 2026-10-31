# feat-approximate-age-2026-10-31-kayj — frontend handoff

For the session that builds the clinozy-fe half of this iteration once the backend PR merges. The
backend owns the contract ([routes-final.md](routes-final.md), [frontend-route-map.md](frontend-route-map.md));
this file adds the screens, the frontend decisions (AMBER — the builder may change them and records
why) and the acceptance the frontend must meet. No frontend code was written in this iteration.

## 1. The contract (built, merged with the backend PR)

### Write — `POST /app/contacts`, `PATCH /app/contacts/{contact_id}`

Also the inline `contact` object of `POST /app/patients` and `POST /app/leads` (same schema).

| Field | Type | Rule |
| --- | --- | --- |
| `date_of_birth` | `YYYY-MM-DD` or `null` | not in the future; a sent date sets `date_of_birth_is_approximate` false; `null` clears the date and the flag |
| `age` | integer | **new** — whole years, 0–120; stored as `date_of_birth` = organization's today − `age` years and `date_of_birth_is_approximate` true; never stored as such |

- Send `age` **or** `date_of_birth`, never both — even `{ age: 30, date_of_birth: null }` is refused.
- Errors (HTTP 400, `error.errors[]`):

| Case | `field` | `message` (en) |
| --- | --- | --- |
| `age` and `date_of_birth` in one body | `body.age` | "Send an age or a date of birth, not both" (`errors:validation.contactAgeOrDateOfBirth`) |
| `age` not an integer, < 0 or > 120 | `body.age` | the standard number message |
| `date_of_birth` in the future | `date_of_birth` | "The date of birth can't be in the future" (unchanged) |

### Read — every Contact answer

List, get, create, update, delete/restore and `GET /app/contacts/{contact_id}/preview` carry:

| Field | Type | Meaning |
| --- | --- | --- |
| `date_of_birth` | string or null | real or approximate |
| `date_of_birth_is_approximate` | boolean | true when it came from a typed age |
| `age` | integer or null | whole years on the organization's today; null without a birth date |

Patients and leads do **not** embed the birth date: a patient carries `contact_id`, a lead a
`contact` summary without it — read the age from the Contact (`GET /app/contacts?ids=…`, which the
patients list already uses for names).

### Filters — `age_from`, `age_to`

On `GET /app/contacts`, `GET /app/patients`, `GET /app/patients/exports`, `GET /app/leads`,
`GET /app/leads/exports` (and saved views, which check filters against the same query): whole years
0–120, inclusive, either may be omitted; a person without a birth date never matches; out of range
or not a number → 400 on the query field.

## 2. Screens to change

| Screen | Change |
| --- | --- |
| Contact form (create / edit — the contact drawer, and the new-patient and new-lead forms' inline contact) | A "Birth date / Age" field with two modes: pick a date (today's date picker) or type an age (whole years). Saving sends only the active mode's field. Editing a contact whose `date_of_birth_is_approximate` is true opens in Age mode showing `age`; clearing either mode sends `date_of_birth: null` |
| Contact drawer, hover card (preview), patient file header, lead drawer | Wherever the age or birth date shows: "34 y"; when `date_of_birth_is_approximate` is true add an "approx." mark (and, for a real date, the date as today) |
| Contacts, Patients, Leads lists | An "Age" filter: from / to (whole years), mapped to `age_from` / `age_to`; persisted in saved views like the other filters; the list rows may show "34 y" (+ "approx.") where they show the contact |

## 3. Frontend decisions (AMBER)

| # | Decision | Default taken |
| --- | --- | --- |
| FE1 | The mode switch | A segmented control "Birth date · Age" beside the field; Age mode is a numeric input (0–120, step 1) |
| FE2 | Which mode opens on edit | Age when `date_of_birth_is_approximate`, else Birth date |
| FE3 | Age display | "`{age}` y"; approximate → "`{age}` y · approx." with the mark muted and a tooltip "Age given at registration — the birth date is estimated" |
| FE4 | Showing an approximate birth date | Never show the estimated date itself as if real; show the age only (the date stays in the edit form's Birth date mode if the desk switches) |
| FE5 | The age filter control | Two number inputs "from" / "to" in the filter panel; the chip reads "Age 30–40", "Age 30+", "Age ≤ 40" |
| FE6 | Client validation | 0–120 whole numbers before sending; the server's 400 `body.age` message shown under the field |
| FE7 | i18n | New copy ("Age", "y", "approx.", the tooltip, "Birth date", the chip labels) through the app's i18n, English first |

## 4. Suggested data-testids

`contact-dob-mode-date`, `contact-dob-mode-age`, `contact-dob-input`, `contact-age-input`,
`contact-age-error`, `contact-age-display`, `contact-age-approx-mark`, `list-filter-age-from`,
`list-filter-age-to`, `list-filter-age-chip`.

## 5. Acceptance the frontend must meet (BRIEF.md acceptance 6)

- [ ] F-1 On the contact form the desk can type an age (0–120) or pick a birth date; saving an age sends `age` only, a date sends `date_of_birth` only; both are never sent.
- [ ] F-2 After saving age 34 the contact shows "34 y · approx."; after picking a real date the mark disappears.
- [ ] F-3 Editing an approximate contact opens in Age mode with its current age.
- [ ] F-4 A 400 `body.age` shows its message under the age field.
- [ ] F-5 The contacts, patients and leads lists filter by age from/to (the request carries `age_from` / `age_to`), the chip shows the range, and a saved view keeps it.
- [ ] F-6 The new-patient and new-lead inline contact forms take an age too.
- [ ] F-7 The frontend's generated OpenAPI types include `age`, `date_of_birth_is_approximate`, `age_from`, `age_to`; `pnpm health` green.
