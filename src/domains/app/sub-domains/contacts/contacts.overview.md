`src/domains/app/sub-domains/contacts/`

# Contacts

Parent: [app](../../app.overview.md)

## Purpose

One person, one record (launch ROUTE #129 — routes-final §4.A–4.B): name, numbers, Instagram,
preferences and household, saved once and shared by their lead, activity, patient file and
appointments. `GET /app/contacts` is the one search every picker uses (CT9). The contact is at the
folder root (`app.contacts`, with its numbers in `app.contact_phones`); the nested sub-domain
`contact-members/` holds who handles the person (CT11). Not branch-scoped — a person may visit any
branch (CT6).

## Layout

| File / folder | Role |
| --- | --- |
| `contacts.schema.ts` | `app.contacts` (counter, household and search-text triggers in the baseline migration; CHECKs; trigram, name, recency and tag indexes; RLS) and `app.contact_phones` (composite key to the contact's household, the `EXCLUDE` constraint that keeps a number in one household — SQL only) |
| `contacts.constants.ts` | gender, channel and referral values; the known preference tags and the tag pattern (CT14); the caps |
| `contacts.{dto,validator,serializer,types}.ts` | request shapes; the `q` rules (3+ letters, 4+ digits, a whole contact number `C-n`, a patient's or lead's number `#n`, a patient number `PT-n`) and the `match` sort; the response (`phones` on single-contact responses only) |
| `contacts.rules.ts` | `primary_phone` from the numbers, the household of a named contact, the number check that names the contact holding it, the numbers' soft delete with the contact, CT13, a typed age (AG2) and the `age` on every answer (AG3), the preview |
| `contacts.repository.ts` | the shared app record layers on this table: sorts (`name`, `match`, `created_at`, `last_activity_at`), derived filters (`record_number`, `patient_number`, `phone`, `is_awaiting_reply`, `preference_tags`, `is_patient`, `has_open_lead`, `age`), the clash read; `contactAgeCondition` / `contactLinkedAgeCondition` (the age filter, shared with patients and leads) |
| `contacts.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–7 below |
| `contact-members/` | `app.contact_members` + `GET`/`PUT /app/contacts/{contact_id}/members`; its leave part (K4) removes an ended member's rows |
| [`contact-activities/`](contact-activities/contact-activities.overview.md) | `app.contact_activities` — the person's stream (routes 10–16, ROUTE #130) |
| [`contact-message-templates/`](contact-message-templates/contact-message-templates.overview.md) | `app.contact_message_templates` — reusable outgoing texts (routes 17–22, ROUTE #130) |
| `seed/` | `seedContact`, `seedContactMember` and `seedContactsBulk` (three contacts per organization, two sharing a household) |

## Routes

One code set (CT5): `contact:read` · `contact:create` · `contact:update` · `contact:delete`, the
Contacts row of the Roles matrix.

| Route | Gate |
| --- | --- |
| `GET /app/contacts` | `contact:read` |
| `POST /app/contacts` | `contact:create` |
| `GET /app/contacts/{contact_id}` | `contact:read` |
| `PATCH /app/contacts/{contact_id}` | `contact:update` |
| `DELETE /app/contacts/{contact_id}` | `contact:delete` |
| `POST /app/contacts/{contact_id}/restore` | `contact:delete` |
| `GET /app/contacts/{contact_id}/preview` | `contact:read` |
| `GET /app/contacts/{contact_id}/members` | `contact:read` |
| `PUT /app/contacts/{contact_id}/members` | `contact:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on all three tables on the organization GUC; `app.contacts` has the retention-cleanup arm (USING only) for the deleted-record purge (D38).
- **Numbers (CT2):** 1–5, each once, exactly one primary (a partial unique index); `primary_phone` is the copy the lists read, written in the same transaction as the numbers.
- **A number lives in one household (CT3):** the exclusion constraint on live numbers; a clash is a 409 `contact_phone_exists` naming the contact (checked first, so the message names it). Moving a contact moves its numbers (`ON UPDATE CASCADE`). The first contact of a household that holds others stays in its own household (a 400).
- **One search (CT9):** `search_text` (names, email, Instagram, every live number's 10 digits, `c-<number>`) is kept by triggers on both tables behind one trigram index. A text `q` matches when **every word** of it is in `search_text`, in any order — `iyer meera`, `Meera 98250` (a number inside the text is read as its digits, `+91` and separators dropped); the best match ranks the whole text, then the first word (change-natural-contact-search NS5–NS7). Leads, appointments and patients search their contact the same way (`contactLinkedSearchCondition`). `C-12345` is the contact number; `#2371` is the number every screen shows for a patient or a lead, so it finds the person whose live patient file **or** live lead carries it, and `PT-0412` the patient file's (SHELL-M1, D81) — an `IN` over each table's organization-number index.
- **Soft delete carries its reason;** the numbers are marked deleted with the contact and leave the exclusion; a restore re-checks them.
- **Read-only, from the rows that point at a contact (D61):** `open_lead_id` / `open_lead_status`, the preview's `open_lead` and `has_open_lead` come from its open lead (#131); `patient_id` / `patient_number`, the preview's `patient` and `is_patient` from its patient file, `last_visit_on` / `next_visit_on` and the preview's appointments (with `appointment:read`) from its appointments (#132). A live lead, patient file or appointment blocks a delete (`contact_in_use`, CT7); a lead's owner and involved members and an appointment's doctor and therapist handle the contact (CT11).
- **Age instead of a birth date (feat-approximate-age AG1–AG4):** create and update take `age` (whole years, 0–120) or `date_of_birth`, never both (a 400 on `age`). A typed age stores `date_of_birth` = the organization's today minus that many years (29 February → 28 February; never after the database's today) with `date_of_birth_is_approximate` true, so the age counts up by itself; a sent `date_of_birth` turns the flag off, `null` clears both (`chk_contacts_date_of_birth_approximate`: the flag only with a date). Every Contact answers `age` — whole years to the organization's today, set by `decorate`. `age_from` / `age_to` filter the contacts, patients and leads lists on the same age (`date <= today − from years`, `date > today − (to + 1) years`), real and approximate dates alike.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`).
