`src/domains/app/sub-domains/lead-messages/`

# LeadMessage

Parent: [app](../../app.overview.md)

## Purpose

One line of a lead's conversation (launch ROUTE #15). Table `app.lead_messages`.

## Layout

| File | Role |
| --- | --- |
| `lead-messages.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `lead-messages.constants.ts` | value lists the CHECKs and validators share |
| `lead-messages.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `lead-messages.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `lead-messages.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/leads/{lead_id}/messages` | `lead:read` |
| `POST /app/leads/{lead_id}/messages` | `lead:update` |
| `POST /app/lead-messages/{lead_message_id}/resend` | `lead:update` |
| `POST /app/lead-messages/batches` | `lead:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
