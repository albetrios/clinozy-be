`src/domains/app/sub-domains/medical-contacts/`

# MedicalContact

Parent: [app](../../app.overview.md)

## Purpose

A walk-in customer of the store (no patient record) (launch ROUTE #50). Table `app.medical_contacts`.

## Layout

| File | Role |
| --- | --- |
| `medical-contacts.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `medical-contacts.constants.ts` | value lists the CHECKs and validators share |
| `medical-contacts.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `medical-contacts.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `medical-contacts.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-contacts` | `medical_sale:read` |
| `POST /app/medical-contacts` | `medical_sale:create` |
| `GET /app/medical-contacts/{medical_contact_id}` | `medical_sale:read` |
| `PATCH /app/medical-contacts/{medical_contact_id}` | `medical_sale:update` |
| `DELETE /app/medical-contacts/{medical_contact_id}` | `medical_sale:delete` |
| `POST /app/medical-contacts/{medical_contact_id}/restore` | `medical_sale:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
