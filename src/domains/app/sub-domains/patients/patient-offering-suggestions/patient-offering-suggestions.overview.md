`src/domains/app/sub-domains/patients/patient-offering-suggestions/`

# Patient offering suggestion

Parent: [patients](../patients.overview.md)

## Purpose

The patient's plan — the offerings the team suggests, with quantity, price and status (launch
ROUTE #135 — routes-final 7.M, PK7–PK10). Table `app.patient_offering_suggestions` (was
`app.offering_suggestions`).

## Layout

| File | Role |
| --- | --- |
| `patient-offering-suggestions.schema.ts` | the table: quantity 1–99, price ≥ 0, the four statuses, the visit, the check-in, the K8 `suggested_by` key, the duplicate-check index, RLS with the purge arm |
| `patient-offering-suggestions.constants.ts` | statuses, the held and totalled ones, the limits |
| `patient-offering-suggestions.{dto,validator,serializer,types}.ts` | the bodies, the list query (status, visit, check-in) |
| `patient-offering-suggestions.rules.ts` | the active offering, the visit, the duplicate check, `suggested_by`, `offering_name`, `source_label`, `is_below_lowest_price` |
| `patient-offering-suggestions.repository.ts` | the duplicate check, the plan's total, the labels' sources |
| `.service.ts` / `.controller.ts` / `.routes.ts` | routes 68–73; the list's `meta.plan_total` |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/offering-suggestions` | `patient:read` |
| `POST /app/patients/{patient_id}/offering-suggestions` | `patient:update` |
| `GET …/offering-suggestions/{patient_offering_suggestion_id}` | `patient:read` |
| `PATCH …/offering-suggestions/{patient_offering_suggestion_id}` | `patient:update` |
| `DELETE …/offering-suggestions/{patient_offering_suggestion_id}` | `patient:update` |
| `POST …/offering-suggestions/{patient_offering_suggestion_id}/restore` | `patient:update` |

## Key invariants

- **No duplicates (PK9):** one live row holds an offering — planned, next time or accepted (409
  `suggestion_exists` on add, on moving a declined row back, on restore); declined rows stay as a
  record. A check-in's next offerings (TR10) skip what the plan holds.
- **Where it came from (PK8):** the visit or the check-in — `source_label` is derived; the caller is
  `suggested_by_membership_id`.
- **Price (PK9):** none = the offering's billed price × quantity; below its lowest price is flagged,
  not refused; `meta.plan_total` sums the planned and accepted rows. What was invoiced comes from
  sub-domain 8's invoice lines (#136).
