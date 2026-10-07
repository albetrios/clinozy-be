`src/domains/app/sub-domains/leads/`

# Lead

Parent: [app](../../app.overview.md)

## Purpose

An enquiry and its conversation until the person becomes a patient (launch ROUTE #14). Table `app.leads`, with `app.lead_involved_memberships`.

## Layout

| File | Role |
| --- | --- |
| `leads.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `leads.constants.ts` | value lists the CHECKs and validators share |
| `leads.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `leads.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `leads.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/leads` | `lead:read` |
| `GET /app/leads/exports` | `list:export` |
| `POST /app/leads` | `lead:create` |
| `GET /app/leads/{lead_id}` | `lead:read` |
| `PATCH /app/leads/{lead_id}` | `lead:update` |
| `POST /app/leads/{lead_id}/claim` | `lead:update` |
| `POST /app/leads/{lead_id}/release` | `lead:update` |
| `POST /app/leads/{lead_id}/convert` | `patient:create` |
| `POST /app/leads/{lead_id}/reads` | `lead:read` |
| `DELETE /app/leads/{lead_id}` | `lead:delete` |
| `POST /app/leads/{lead_id}/restore` | `lead:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
