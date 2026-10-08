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

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; no purge arm — an entry goes with its contact (`ON DELETE CASCADE`).
- **One shape per type (M2):** a direction only on messages and calls; a delivery status exactly on a sent message; no author on a system or received entry; `system` entries are the server's (no route).
- **At most one record link (M5)**, a live record of the organization; an entry linked to a record the caller cannot read is hidden from the list and is a 404 by id (M10).
- **The contact follows (CT10, CT4):** each entry moves `last_activity_at`, a sent / received message or call `last_sent_at` / `last_received_at`, a sent one `default_channel` — without touching the contact's `updated_at`.
- **Delivery is the messaging worker's (M8, ROUTE #139):** a message stays `queued`; `resend` re-queues a failed one; `provider_message_id` is unique per organization.
