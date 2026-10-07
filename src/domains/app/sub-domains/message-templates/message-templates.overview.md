`src/domains/app/sub-domains/message-templates/`

# MessageTemplate

Parent: [app](../../app.overview.md)

## Purpose

A reusable message with fill-in placeholders (launch ROUTE #17). Table `app.message_templates`.

## Layout

| File | Role |
| --- | --- |
| `message-templates.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `message-templates.constants.ts` | value lists the CHECKs and validators share |
| `message-templates.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `message-templates.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `message-templates.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/message-templates` | `lead:read` |
| `POST /app/message-templates` | `message_template:create` |
| `GET /app/message-templates/{message_template_id}` | `lead:read` |
| `PATCH /app/message-templates/{message_template_id}` | `message_template:update` |
| `DELETE /app/message-templates/{message_template_id}` | `message_template:delete` |
| `POST /app/message-templates/{message_template_id}/restore` | `message_template:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
