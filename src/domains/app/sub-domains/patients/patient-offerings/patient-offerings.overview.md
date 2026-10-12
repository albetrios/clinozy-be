`src/domains/app/sub-domains/patients/patient-offerings/`

# Patient offering

Parent: [patients](../patients.overview.md)

## Purpose

What a patient bought — an offering's sessions and how long they last (launch ROUTE #135 —
routes-final 7.L, PK4–PK6, PK11). Table `app.patient_offerings` (was `app.patient_packages`).
Bought only by invoicing it (sub-domain 8); its sessions are spent only by treatments.

## Layout

| File | Role |
| --- | --- |
| `patient-offerings.schema.ts` | the table: sessions 1–999 with `0 ≤ used ≤ total`, `valid_until` (none = no expiry), the tab and sessions-left indexes, RLS with the purge arm |
| `patient-offerings.constants.ts` | the derived statuses, the sessions limit |
| `patient-offerings.{dto,validator,serializer,types}.ts` | the change body, the list query (`status`, `offering_id`, `is_package`), `sessions_left`, `is_package`, `status` |
| `patient-offerings.rules.ts` | the change's checks (what was spent, the bill's date), the offering's name, the expired status |
| `patient-offerings.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 65–67 — no create, delete or restore of its own (PK4, PK6) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/offerings` | `patient:read` |
| `GET …/offerings/{patient_offering_id}` | `patient:read` |
| `PATCH …/offerings/{patient_offering_id}` | `payment:update` |

## Key invariants

- **Bought only by invoicing (PK4):** the invoice service creates it for a `treatment`, `package`
  or `lhr` line (#136); it comes and goes with its invoice.
- **Sessions move only with treatments (PK5, TR7):** one guarded `sessions_used ± 1` per session
  recorded or reversed; `status` is derived — `active`, `used_up`, `expired` (the organization's
  today).
- **A change (PK6):** `sessions_total` never below `sessions_used`, `valid_until` never before the
  invoice's date.
