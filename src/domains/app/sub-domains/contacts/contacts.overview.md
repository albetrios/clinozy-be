# contacts

Every person — patient, lead or walk-in buyer of the medical store — as one kind of record (launch
RC-140, ROUTE #62).

| Route | Gate | Does |
| --- | --- | --- |
| `GET /api/v1/app/contacts?q=&kind=` / `?phone=` | `organization:read` (+ the kind's `:read`) | `[{ kind, id, name, phone, email, number, created_at }]`, 5 per kind |
| `GET /api/v1/app/contacts/{contact_id}/preview` | `organization:read` (+ the kind's `:read`) | the contact + `next_appointment`, `last_appointment`, `lead_status`, `linked_patient_id` |

- No table: reads through the patients, leads, medical contacts and appointments services (their rules and D9 visibility hold).
- `contact_id` is a `pat_`, `lead_` or `mcon_` id — the kind comes from the prefix, so it is not one entity in `PARAM_NAME_TO_ENTITY`.
- "Today" is the organization's own date (`OrganizationService.requireOrganizationTimeZone`, D41).
