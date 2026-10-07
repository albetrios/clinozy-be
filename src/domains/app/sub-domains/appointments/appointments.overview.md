`src/domains/app/sub-domains/appointments/`

# Appointment

Parent: [app](../../app.overview.md)

## Purpose

A booked slot for a patient or a lead with a doctor, in a branch — a room and a machine may be named (D28) (launch ROUTE #21). Table `app.appointments`.

## Layout

| File | Role |
| --- | --- |
| `appointments.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `appointments.constants.ts` | value lists the CHECKs and validators share |
| `appointments.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `appointments.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `appointments.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/appointments` | `appointment:read` |
| `GET /app/appointments/exports` | `list:export` |
| `POST /app/appointments` | `appointment:create` |
| `GET /app/appointments/{appointment_id}` | `appointment:read` |
| `PATCH /app/appointments/{appointment_id}` | `appointment:update` |
| `POST /app/appointments/{appointment_id}/status` | `appointment:update` |
| `POST /app/appointments/{appointment_id}/cancel` | `appointment:update` |
| `POST /app/appointments/{appointment_id}/reinstate` | `appointment:update` |
| `POST /app/appointments/{appointment_id}/undo-check-in` | `appointment:update` |
| `DELETE /app/appointments/{appointment_id}` | `appointment:delete` |
| `POST /app/appointments/{appointment_id}/restore` | `appointment:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
