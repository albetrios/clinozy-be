`src/domains/app/sub-domains/patients/prescription-kits/`

# Prescription kit

Parent: [patients](../patients.overview.md)

## Purpose

A doctor's own reusable prescription lines, copied into a draft by the screen — no server-side
apply (launch ROUTE #133 — routes-final 7.D, P17). Table `app.prescription_kits`; its routes are
top-level, no one patient owns a kit (P22).

## Layout

| File | Role |
| --- | --- |
| `prescription-kits.schema.ts` | the table: `owner_membership_id` (K8, `CASCADE`), the name unique per owner in any case, the lines' checks, RLS |
| `prescription-kits.{constants,dto,validator,serializer,types}.ts` | the bodies (the prescription's line shape), the list query |
| `prescription-kits.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 21–26 on the kernel's owner column |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/prescription-kits` (my kits) | `patient_prescription:create` |
| `POST /app/prescription-kits` | `patient_prescription:create` |
| `GET /app/prescription-kits/{prescription_kit_id}` | `patient_prescription:create` |
| `PATCH /app/prescription-kits/{prescription_kit_id}` | `patient_prescription:create` |
| `DELETE /app/prescription-kits/{prescription_kit_id}` | `patient_prescription:create` |
| `POST /app/prescription-kits/{prescription_kit_id}/restore` | `patient_prescription:create` |

## Key invariants

- **Each member's own (P17):** `ownerMembershipColumn` — a create belongs to the caller's
  membership; another member's kit never lists and is a 404 by id.
