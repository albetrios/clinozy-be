# task-rule-settings

The organization's task rules (launch ROUTE #60) — whether each rule creates tasks, and whether
Clinozy handles it by itself ("Clinozy handles it").

| Route | Gate | Does |
| --- | --- | --- |
| `GET /api/v1/app/task-rule-settings` | `task:read` | every rule, saved setting or default (`id: null` — on, not automatic) |
| `PUT /api/v1/app/task-rule-settings` | `task_rule:update` (Owner, Admin — D19) | saves the named rules' `is_on` / `is_automatic`; returns the whole list |

- Table `app.task_rule_settings` — one row per rule (`idx_task_rule_settings_organization_rule_unique`), RLS on the organization GUC.
- Hand-built over the shared app record service (`base-record.service.ts`); the generator writes the schema, DTO, validator, types, serializer and repository, and leaves the `// hand-edited` files alone.
