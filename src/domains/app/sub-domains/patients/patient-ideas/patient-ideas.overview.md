`src/domains/app/sub-domains/patients/patient-ideas/`

# Patient ideas

Parent: [patients](../patients.overview.md)

## Purpose

"Ideas from history" on the patient's plan (launch ROUTE #152 — routes-final 7.N, D80, WC-47): at
most four offerings to suggest next, each with a reason. With Data consent and the AI switched on
(`PATIENT_IDEAS_AI_ENABLED`), the ideas Claude suggested from a de-identified summary, refreshed in
the background; otherwise the prototype's rules on the patient's history. Table
`app.patient_ideas` (the stored AI ideas) and the stale mark `app.patients.ideas_stale_since`.

## Layout

| File | Role |
| --- | --- |
| `patient-ideas.schema.ts` | the stored AI ideas: one row per offering, position 1–4, the reason, cascade with the patient and the offering, RLS |
| `patient-ideas.constants.ts` | the limits (4 ideas, 200-character reasons, batches), the sources and origins |
| `patient-ideas.rules.ts` | `ruleIdeas` — the prototype's rules (PI1) |
| `patient-ideas.ai.ts` | `buildIdeasPrompt` / `parseIdeasAnswer` — the prompt and the reading of Claude's JSON (PI6) |
| `patient-ideas.repository.ts` | the patient, the menu, the plan, the history (rules), the summary (Claude), the stored ideas, the stale marks; the sweep's cross-organization read |
| `patient-ideas.{dto,validator,serializer,types}.ts` | the path params, the idea's shape |
| `.service.ts` / `.controller.ts` / `.routes.ts` | route 74 |
| `queues/` / `workers/` | the five-minute sweep and the per-organization refresh (WC-47) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/offering-ideas` | `patient:read` |

`meta.source` is `ai` or `rules`; `meta.ai_refreshed_at` the refresh's time for AI ideas.

## Key invariants

- **Never in the plan (PI2):** an offering in the plan (any status but declined) or inactive is
  never an idea — the rules skip it, the parser drops it, the route filters stored ideas again.
- **Stale marks (PI4):** database triggers mark the file on a clinical note, a treatment, a bought
  offering or a plan change, a completed visit and a consent change — no write path can forget.
- **Compare-and-clear (PI5):** the refresh clears the mark only if it still holds the value read (to
  the microsecond), then replaces the ideas; a write meanwhile leaves the file for the next run.
- **Consent (PI3):** without Data consent nothing goes to Claude, the stored ideas are deleted on
  the next refresh and the route shows the rules at once.

## Background work

- `patient-ideas-sweep` (every five minutes, off the task rules' minute): one job per organization
  with stale files (`global_retention_cleanup` read, `app.patients` bypass arm).
- `patient-ideas` (per organization, deduplicated): up to 20 stale files, oldest first; one read,
  Claude outside any context, one short write per file. A throttle or the `anthropic` circuit pauses
  the queue. Both start only while `PATIENT_IDEAS_AI_ENABLED` is on.
