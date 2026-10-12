`src/domains/app/sub-domains/contacts/contact-activities/`

# Contact activities

Parent: [contacts](../contacts.overview.md)

## Purpose

A contact's stream (launch ROUTE #130 — routes-final §4.C; was `app/sub-domains/messages/`):
WhatsApp and Instagram messages, call logs, the team's notes and server events, one stream per
person — the lead drawer and appointment form show it as "Chat". Append-only (M7): an entry is never
edited or deleted, and it goes only with its contact.

## Layout

| File | Role |
| --- | --- |
| `contact-activities.schema.ts` | `app.contact_activities` — the M2 / M5 CHECKs, the twelve record links (today's tables, D63), the K8 author key, the stream and outbox indexes, RLS |
| `contact-activities.constants.ts` | types, directions, delivery statuses, groups, the link columns, the caps, the placeholders |
| `contact-activities.{dto,validator,serializer,types}.ts` | one body per action route (M12), the stream query, the response with its derived `group` |
| `contact-activities.rules.ts` | author, template type, confirmed uploads, the answered entry, placeholders, the contact's activity times (CT10, CT4), M10's read scope, the message batch |
| `contact-activities.repository.ts` | the shared app record layers on an append-only table; the `group` expression |
| `contact-activities.service.ts` / `.controller.ts` / `.routes.ts` | routes 10–16 below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/contacts/{contact_id}/activities` | `contact_activity:read` |
| `POST /app/contacts/{contact_id}/activities/send-message` | `contact_activity:create` |
| `POST /app/contacts/{contact_id}/activities/log-call` | `contact_activity:create` |
| `POST /app/contacts/{contact_id}/activities/add-note` | `contact_activity:create` |
| `GET /app/contacts/{contact_id}/activities/{contact_activity_id}` | `contact_activity:read` |
| `POST /app/contacts/{contact_id}/activities/{contact_activity_id}/resend` | `contact_activity:update` |
| `POST /app/contact-activities/message-batches` | `contact_activity:create` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; an entry goes with its contact (`ON DELETE CASCADE`).
- **One shape per type (M2):** a direction only on messages and calls; a delivery status exactly on a sent message; no author on a system or received entry; `system` entries are the server's (no route).
- **At most one record link (M5)**, a live record of the organization; an entry linked to a record the caller cannot read is hidden from the list and is a 404 by id (M10).
- **The contact follows (CT10, CT4):** each entry moves `last_activity_at`, a sent / received message or call `last_sent_at` / `last_received_at`, a sent one `default_channel` — without touching the contact's `updated_at`.
- **The outbox (M8):** a send, a batch and a resend leave a `queued` message. Clinozy sends nothing itself: delivering the outbox and writing back `sent` / `delivered` / `read` / `failed` is the separate messaging service's, reserved as `MESSAGING_SERVICE_URL` and not built yet.
- **The task rules run (D81 T7, WC-48):** a message or a call — written, batched or resent — asks for the organization's `task-rules` run after the commit, so a reply closes the person's `reply` task (and a resend its `failed_message` task) at once rather than at the five-minute sweep.
- **Clinozy's messages (D78):** a queued WhatsApp entry with no author carries its `automation_kind` — `booking_confirm`, `booking_reminder` (the rules run, WC-5, WC-6), `payment_receipt` (WC-9), `payment_reminder`, `feedback_request` (TK10); a move, a cancel, a no-show, a reinstate or a delete stops the booking's queued message (`failed`, `reminder_stopped` — no `failed_message` task).
