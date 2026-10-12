`src/domains/app/sub-domains/medical/medical-reps/`

# Medical rep

Parent: [medical](../medical.overview.md)

## Purpose

The medical representatives who visit the store (launch ROUTE #153 — routes-final 11.F, MD17).
Tables `app.medical_reps` and `app.medical_rep_manufacturers`. Their visits nest in
[`medical-rep-visits/`](medical-rep-visits/medical-rep-visits.overview.md).

## Layout

| File | Role |
| --- | --- |
| `medical-reps.schema.ts` | the tables: the next visit, the brand links, RLS |
| `medical-reps.rules.ts` | the next visit's window, the latest visit and the overdue flag |
| `medical-reps.repository.ts` | the shared reads and writes, the next visit, the latest visit, the brands |
| `medical-reps.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `medical-reps.service.ts` / `.controller.ts` / `.routes.ts` | routes 33–38 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-reps` | `medicine:read` |
| `POST /app/medical-reps` | `medicine:create` |
| `GET /app/medical-reps/{medical_rep_id}` | `medicine:read` |
| `PATCH /app/medical-reps/{medical_rep_id}` | `medicine:update` |
| `DELETE /app/medical-reps/{medical_rep_id}` | `medicine:delete` |
| `POST /app/medical-reps/{medical_rep_id}/restore` | `medicine:delete` |

## Key invariants

- **The visit reminder (MD8):** the `medical_rep_visit` task rule opens a pharmacist-queue task on
  `next_visit_on`; logging the visit moves or clears the date and the task closes.
