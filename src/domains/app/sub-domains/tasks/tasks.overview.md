`src/domains/app/sub-domains/tasks/`

# Tasks

Parent: [app](../../app.overview.md)

## Purpose

The work queue (routes-final §10, launch ROUTE #138): tasks added by hand, follow-ups set when a
task is resolved, and the tasks the rules open and close by themselves. Tables `app.tasks` and
`app.task_owner_changes`; the rules' switches live in the nested
[task-rule-settings](task-rule-settings/task-rule-settings.overview.md).

## Layout

| File | Role |
| --- | --- |
| `tasks.schema.ts` | `app.tasks` (kind, rule key, owner or role queue, the person, one record link, the generated `source_key`, the one-open-task-per-rule-per-record index) and `app.task_owner_changes` (append-only), RLS |
| `tasks.constants.ts` | kinds, the 14 rules, the role queues, statuses, outcomes, tabs, scopes |
| `tasks.{dto,validator,serializer,types}.ts` | request shapes, parsing (the tab → status, the rules-on filter), the response (the person's summary, owner changes, `can_clinozy_handle`, `next_task_id`) |
| `tasks.repository.ts` | the shared app record layer plus Mine, the rules-on filter, owner checks, owner-change rows, the record's person and branch, the leave step's release, `insertRuleTask` |
| `tasks.rules.ts` | owner and record checks, rule tasks never edited, the actions `resolve` (outcomes and their effects, what's next) and `reassign` (the lead moves too), the drawer's decoration |
| `tasks.rule-tasks.ts` | `openRuleTask` / `openCallBackTask` — the write-time rule tasks (a check-in or review needing action, an `unhappy` outcome) |
| `tasks.service.ts` / `.controller.ts` / `.routes.ts` | the routes below |
| `task-rule-conditions.repository.ts` | the 14 rules as SQL — which records open a task, while when it stays open, its due time and owner |
| `task-rules.repository.ts` | the rules job's reads and writes on its pinned handle; the sweep's organization read; `queueClinozyMessage` (a queued WhatsApp entry from Clinozy with its `automation_kind`) |
| `task-rule-messages.repository.ts` | the reads of the messages the run queues (D78): the day-before reminders, the confirm requests, the receipts |
| `queues/` · `workers/` | TK4: the five-minute sweep (`task-rules-sweep`) and the per-organization job (`task-rules`) |
| `task-rule-settings/` | routes 11–12 — the switches |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/tasks` | `task:read` |
| `GET /app/tasks/exports` | `task:export` |
| `POST /app/tasks` | `task:create` |
| `GET /app/tasks/{task_id}` | `task:read` |
| `PATCH /app/tasks/{task_id}` | `task:update` |
| `POST /app/tasks/{task_id}/snooze` | `task:update` |
| `POST /app/tasks/{task_id}/resolve` | `task:update` |
| `POST /app/tasks/{task_id}/reassign` | `task:update` |
| `DELETE /app/tasks/{task_id}` | `task:delete` |
| `POST /app/tasks/{task_id}/restore` | `task:delete` |

## The rules worker (TK4, TK10)

Every five minutes `task-rules-sweep` pages through the active team organizations and adds one
deduplicated `task-rules` job each. The job, in the organization's context and one transaction:
wakes the snoozed tasks whose time came; per rule closes the open tasks whose record no longer
qualifies ("Done by Clinozy"), then — when the rule is on — opens one task for each record that
qualifies and has no open one (nor one a person resolved since the condition began); then takes
the step of the due tasks of the rules set to "Let Clinozy handle" (a queued WhatsApp message for
`confirm`, `payment_due` and `feedback`; a re-target lead for `gone_quiet`) and closes them. At most
200 tasks per rule per run.

Then, when the clinic's WhatsApp is connected and delivery is on, it queues Clinozy's notices
(launch D78, `workers/task-rules-messages.processor.ts`): the day-before reminder of tomorrow's
bookings once the clinic's `reminder_hour` has passed (WC-6, `reminder_queued`), the confirm
request of each scheduled booking not asked yet — more than 2 hours and at most 60 days ahead, no
walk-in (WC-5, `confirm_requested`) — and the receipt of each `receipt` payment of the last 24 hours
(WC-9). Reminders go first, so a booking due both gets the reminder alone. A notice moves only the
contact's `last_activity_at` (a question the person asked still waits for a person — the `reply`
rule). `confirm`'s own step sends nothing when the booking was asked already. A booking, a move
and a reinstate ask for the run right after their commit; the job asks for delivery when it
queued anything.

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC on both tables; the retention
  arm (USING only) lets the deleted-record purge erase `app.tasks` rows.
- **One open task per rule per record (TK4):** the unique partial index on
  `(organization_id, rule_key, source_key)`; every rule task goes through it.
- **An owner or a role queue (TK6):** one of the two; an owner is an active member who can see tasks.
- **Rule tasks are the server's (TK7, TK9):** never changed or deleted by hand (`409 rule_task`).
- **Who had it (TK8):** every reassign and every leave writes an owner-change row.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409.
