`src/domains/app/sub-domains/patient-packages/`

# PatientPackage

Parent: [app](../../app.overview.md)

## Purpose

A package a patient bought (or is about to) — its sessions and expiry (launch ROUTE #31). Table `app.patient_packages`.

## Layout

| File | Role |
| --- | --- |
| `patient-packages.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `patient-packages.constants.ts` | value lists the CHECKs and validators share |
| `patient-packages.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `patient-packages.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `patient-packages.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/packages` | `patient:read` |
| `POST /app/patients/{patient_id}/packages` | `payment:create` |
| `GET /app/patient-packages/{patient_package_id}` | `patient:read` |
| `PATCH /app/patient-packages/{patient_package_id}` | `patient:update` |
| `DELETE /app/patient-packages/{patient_package_id}` | `payment:delete` |
| `POST /app/patient-packages/{patient_package_id}/restore` | `payment:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
