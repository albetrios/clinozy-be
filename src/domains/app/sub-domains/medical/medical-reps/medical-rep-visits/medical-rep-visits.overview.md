`src/domains/app/sub-domains/medical/medical-reps/medical-rep-visits/`

# Medical rep visit

Parent: [medical reps](../medical-reps.overview.md)

## Purpose

An MR's logged visits, nested under the MR (launch ROUTE #153 — routes-final 11.G, MD18). Table
`app.medical_rep_visits`; never changed.

## Layout

| File | Role |
| --- | --- |
| `medical-rep-visits.schema.ts` | the table: the next visit after the visit, the author, RLS |
| `medical-rep-visits.rules.ts` | the dates, the author, the MR's next visit set or cleared |
| `medical-rep-visits.repository.ts` | the shared reads and writes |
| `medical-rep-visits.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `medical-rep-visits.service.ts` / `.controller.ts` / `.routes.ts` | routes 39–43 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-reps/{medical_rep_id}/visits` | `medicine:read` |
| `POST /app/medical-reps/{medical_rep_id}/visits` | `medicine:create` |
| `GET /app/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}` | `medicine:read` |
| `DELETE /app/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}` | `medicine:delete` |
| `POST /app/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}/restore` | `medicine:delete` |

## Key invariants

- **A visit sets the MR's next visit** to its `next_visit_on`, or clears it when none is sent and
  the MR's was on or before the visit.
