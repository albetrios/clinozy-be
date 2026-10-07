`src/domains/app/sub-domains/feedback-actions/`

# FeedbackAction

Parent: [app](../../app.overview.md)

## Purpose

What the team did about a check-in or a review (launch ROUTE #43). Table `app.feedback_actions`.

## Layout

| File | Role |
| --- | --- |
| `feedback-actions.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `feedback-actions.constants.ts` | value lists the CHECKs and validators share |
| `feedback-actions.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `feedback-actions.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `feedback-actions.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/feedback-actions` | `patient:read` |
| `POST /app/feedback-actions` | `patient:update` |
| `GET /app/feedback-actions/{feedback_action_id}` | `patient:read` |
| `PATCH /app/feedback-actions/{feedback_action_id}` | `patient:update` |
| `DELETE /app/feedback-actions/{feedback_action_id}` | `patient:update` |
| `POST /app/feedback-actions/{feedback_action_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
