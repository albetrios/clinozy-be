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
| `contact-activities.schema.ts` | `app.contact_activities` — the M2 / M5 CHECKs, the twelve record links (today's tables, D63), the K8 author key, the stream and delivery-queue indexes, RLS |
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
| `GET /app/contact-activities/messaging-status` | `contact_activity:read` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC, with the global-retention read arm for the messaging sweep (launch D77); an entry goes with its contact (`ON DELETE CASCADE`).
- **One shape per type (M2):** a direction only on messages and calls; a delivery status exactly on a sent message; no author on a system or received entry; `system` entries are the server's (no route).
- **At most one record link (M5)**, a live record of the organization; an entry linked to a record the caller cannot read is hidden from the list and is a 404 by id (M10).
- **The contact follows (CT10, CT4):** each entry moves `last_activity_at`, a sent / received message or call `last_sent_at` / `last_received_at`, a sent one `default_channel` — without touching the contact's `updated_at`.
- **Delivery is the messaging worker's (M8, ROUTE #139, D77):** a send, a batch and a resend leave a `queued` message and, after the commit, ask for the organization's `contact-message-delivery` job (deduplicated per organization; the one-minute `contact-messaging-sweep` re-enqueues any organization whose queued messages no job holds). The job claims a batch (`delivery_claimed_at`, stale after 5 minutes), sends each through the platform Meta app outside any database context and writes `sent` + `provider_message_id`, or `failed` + `failure_reason` (no account connected, not on WhatsApp, no Instagram conversation yet, Meta's refusal); while Meta is down or throttling the queue pauses and the messages stay `queued`. An Instagram reply goes to the `provider_sender_id` of the person's latest Instagram message. `provider_message_id` is unique per organization; delivery reports from the webhook move a message forward only.
- **Clinozy's messages (D78):** a queued WhatsApp entry with no author carries its `automation_kind` — `booking_confirm`, `booking_reminder` (the rules run, WC-5, WC-6), `payment_receipt` (WC-9), `payment_reminder`, `feedback_request` (TK10); the reminder's send moves its booking to `reminder_sent`, a failure of the message the booking waits on to `failed`; a move, a cancel, a no-show, a reinstate or a delete stops the booking's unclaimed message (`failed`, `reminder_stopped` — no `failed_message` task).
- **Files go as media (WC-11, D78):** a message's `attachment_keys` are sent as WhatsApp media from presigned links (1 hour) — an image for JPEG / PNG, else a document with its name — the text the first file's caption; on Instagram the text first, then each file. An upload gone since the send fails the message.
- **Day-close summaries (WC-10, D78):** the same job then sends each closed day of the last 24 hours not summarised (`day_closes.summary_sent_at`) to the admins' numbers — active members holding `organization:update` with a phone — and stamps it; a close and the midnight auto-close ask for the job, and the one-minute sweep covers a lost one.
- **The composer's status (WC-2):** `messaging-status` answers whether delivery is on, whether Meta is down (the `meta` circuit), and each channel's account and queue.
