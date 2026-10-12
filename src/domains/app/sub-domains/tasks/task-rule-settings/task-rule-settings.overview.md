`src/domains/app/sub-domains/tasks/task-rule-settings/`

# Task rule settings

Parent: [tasks](../tasks.overview.md)

## Purpose

The organization's switch per task rule (routes-final 10.B, TK10, launch ROUTE #138): whether the
rule opens tasks (`is_on`) and whether Clinozy takes its step by itself ("Let Clinozy handle",
`is_automatic`). No row means on, by hand. Table `app.task_rule_settings`.

## Routes

| Route | Gate | Does |
| --- | --- | --- |
| `GET /app/task-rule-settings` | `task:read` | the 14 rules in the Rules popover's order — saved, or the default (`id` null: on, by hand) — each with `can_be_automatic` |
| `PUT /app/task-rule-settings` | `organization:update` | saves the sent rules in one transaction; answers with all 14 |

## Key invariants

- **One row per rule:** unique `(organization_id, rule_key)`; no soft delete — a save upserts.
- **Only four rules can be automatic:** `confirm`, `payment_due`, `feedback`, `gone_quiet` — the
  CHECK `chk_task_rule_settings_automatic`, and a 400 `rules/<i>/is_automatic` for the others.
- **A rule that is off** opens no tasks and hides its open ones from every tab of `GET /app/tasks`;
  its tasks still close when their record changes.
- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC.
