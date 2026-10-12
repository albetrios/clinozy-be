`src/domains/app/sub-domains/contacts/contact-message-templates/`

# Contact message templates

Parent: [contacts](../contacts.overview.md)

## Purpose

Reusable texts for outgoing WhatsApp and Instagram messages (launch ROUTE #130 — routes-final
§4.D; was `app/sub-domains/message-templates/`). `<first>` and `<interest>` in a body are filled for
each contact when it is sent, on a single send and in a batch (M9).

## Layout

| File | Role |
| --- | --- |
| `contact-message-templates.schema.ts` | `app.contact_message_templates` — `type` `whatsapp` · `instagram`, the name unique in any case among live templates, RLS with the purge arm |
| `contact-message-templates.{dto,validator,serializer,types,constants}.ts` | request shapes, the list query (`q` on the name, `type`), the response |
| `contact-message-templates.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | the shared app record layers; routes 17–22 below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/contact-message-templates` | `organization:read` (every member) |
| `POST /app/contact-message-templates` | `contact_activity:create` |
| `GET /app/contact-message-templates/{contact_message_template_id}` | `organization:read` |
| `PATCH /app/contact-message-templates/{contact_message_template_id}` | `contact_activity:update` |
| `DELETE /app/contact-message-templates/{contact_message_template_id}` | `contact_activity:delete` |
| `POST /app/contact-message-templates/{contact_message_template_id}/restore` | `contact_activity:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS; the retention-cleanup arm lets the deleted-record purge (D38) erase rows.
- **A template is of one type:** a message (or batch) of the other type refuses it with a 400 on `contact_message_template_id`.
- **Soft delete carries its reason;** a deleted template stays linked from the entries written with it until the purge (`ON DELETE SET NULL`).
