`src/domains/app/sub-domains/messages/`

# Message

Parent: [app](../../app.overview.md)

## Purpose

One line of a contact's conversation — a patient, a lead or a walk-in buyer; WhatsApp, Instagram, SMS, email, a call or a note (launch ROUTE #15). Table `app.messages`.

## Layout

| File | Role |
| --- | --- |
| `messages.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `messages.constants.ts` | value lists the CHECKs and validators share |
| `messages.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `messages.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `messages.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/messages` | `lead:read` |
| `POST /app/messages` | `lead:update` |
| `GET /app/messages/{message_id}` | `lead:read` |
| `POST /app/messages/{message_id}/resend` | `lead:update` |
| `POST /app/messages/batches` | `lead:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
