`src/domains/app/sub-domains/patients/patient-feedback-actions/`

# Patient feedback action

Parent: [patients](../patients.overview.md)

## Purpose

What was done about one check-in or one review — a doctor's call, a revisit, a reply (launch
ROUTE #134 — routes-final 7.K, TR12). Table `app.patient_feedback_actions`. No routes of its own: an
action is logged under its parent (`POST …/check-ins/{id}/actions`, `POST …/reviews/{id}/actions`)
and returned inside it (`actions`).

## Layout

| File | Role |
| --- | --- |
| `patient-feedback-actions.schema.ts` | the append-only table: exactly one parent, the action and note-for-other CHECKs, the K8 author key, RLS |
| `patient-feedback-actions.constants.ts` | the nine actions |
| `patient-feedback-actions.{dto,validator,serializer,types}.ts` | the log body, the action as its parent returns it |
| `patient-feedback-actions.repository.ts` | insert one, read a page's parents' actions |
| `patient-feedback-actions.rules.ts` | the `actions` record action the parents use, `actions` + `needs_action` for a page |

## Key invariants

- **Append-only (TR12):** no change, delete or restore — a wrong action is followed by a right one;
  actions go with their parent (`ON DELETE CASCADE`).
- **One parent:** a check-in or a review, never both (`chk_patient_feedback_actions_one_parent`).
- **The first action turns `needs_action` off;** the author is the caller's membership (none for an
  API key); `note` is required for `other`.
