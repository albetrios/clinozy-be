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
| `contacts.{dto,validator,serializer,types}.ts` | request shapes; the `q` rules (3+ letters, 4+ digits, a whole contact number) and the `match` sort; the response (`phones` on single-contact responses only) |
| `contacts.rules.ts` | `primary_phone` from the numbers, the household of a named contact, the number check that names the contact holding it, the numbers' soft delete with the contact, CT13, the preview |
| `contacts.repository.ts` | the shared app record layers on this table: sorts (`name`, `match`, `created_at`, `last_activity_at`), derived filters (`phone`, `is_awaiting_reply`, `preference_tags`, `is_patient`, `has_open_lead`), the clash read |
| `contacts.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–7 below |
| `contact-members/` | `app.contact_members` + `GET`/`PUT /app/contacts/{contact_id}/members`; its leave part (K4) removes an ended member's rows |
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
- **One search (CT9):** `search_text` (names, email, Instagram, every live number's 10 digits, `c-<number>`) is kept by triggers on both tables behind one trigram index.
- **Soft delete carries its reason;** the numbers are marked deleted with the contact and leave the exclusion; a restore re-checks them.
- **Read-only until later rows (D61):** `patient_id`, `patient_number`, `open_lead_*`, `last_visit_on`, `next_visit_on` and the preview's lead, patient and appointments are null, `is_patient` / `has_open_lead` match none, and nothing blocks a delete (`contact_in_use`, CT7) until #131–#133 point leads, appointments and patient files at contacts.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 (`record_changed`).
