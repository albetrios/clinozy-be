`src/domains/app/sub-domains/patients/patient-ideas/`

# Patient ideas

Parent: [patients](../patients.overview.md)

## Purpose

"Ideas from history" on the patient's plan (launch ROUTE #152 — routes-final 7.N): at most four
offerings to suggest next, each with a reason, by the prototype's rules on the patient's history.
AI ideas are a separate service, kept out of Clinozy (reserved as `AI_SERVICE_URL`, not built yet).

## Layout

| File | Role |
| --- | --- |
| `patient-ideas.constants.ts` | the limits (4 ideas, the notes and offerings read), the sources, the concern vocabulary |
| `patient-ideas.rules.ts` | `ruleIdeas` — the prototype's rules (PI1); `concernLabels` — a note's concerns |
| `patient-ideas.repository.ts` | the patient, the menu, the plan, the history the rules read |
| `patient-ideas.{dto,validator,serializer,types}.ts` | the path params, the idea's shape |
| `.service.ts` / `.controller.ts` / `.routes.ts` | route 74 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/offering-ideas` | `patient:read` |

## Key invariants

- **Never in the plan (PI2):** an offering in the plan (any status but declined) or inactive is
  never an idea.
- **A read only:** no table of its own, no background work — each read runs the rules afresh.
