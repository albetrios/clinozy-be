# Tasks and rules

Status: ready
Kind: screen
Depends on: leads-and-messages, appointments, patient-file, payments-and-invoices
Tables: `task`, `task_owner_change`, `task_rule_setting` — [db-changes.md](../../db-changes.md)

## Stories

- As any staff member I want my tasks from the rules with quick outcomes so that every follow-up happens.
- As an Owner or Admin I want to tune the task rules so that they fit the clinic.

## Rules

- An unowned task sits in its role's queue (`operations.tasks`)
- Owner and Admin change the rule settings (`access.task-rule-settings`)

## Acceptance criteria

- **tasks.1** Tasks come from the 13 rules, each with an owner or a role queue — intake-files/PRD.md:93
- **tasks.2** Outcomes resolve tasks; snooze returns them at the chosen time; reassign keeps history — intake-files/PRD.md:94
- **tasks.3** Staff create a task with type, priority and reminder — intake-files/PRD.md:94
- **tasks.4** Owner and Admin switch rules on or off and set their due time and owner — intake-files/PRD.md:93

## Work items

- `data.stage-tasks`
- `operations.tasks`
- `operations.task-rules`
- `access.task-rule-settings`
- `background.task-reply`
- `background.task-failed-message`
- `background.task-follow-up`
- `background.task-call-back`
- `background.task-claim`
- `background.task-confirm`
- `background.task-arrive`
- `background.task-rebook`
- `background.task-feedback`
- `background.task-aftercare`
- `background.task-next-visit`
- `background.task-gone-quiet`
- `background.task-payment-due`
- `background.task-onboarding`
- `background.task-unhappy`
- `background.task-settle-by`
- `background.task-medical-rep-visit`
- `background.task-auto-resolve`
- `background.task-snooze-return`
- `background.task-automation`
- `background.task-dedupe`
