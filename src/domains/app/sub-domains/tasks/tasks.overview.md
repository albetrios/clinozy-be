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
| `tasks.constants.ts` | kinds, the 15 rules, the role queues, statuses, outcomes and the ones each rule offers (`TASK_RULE_OUTCOMES`), tabs, scopes |
| `tasks.{dto,validator,serializer,types}.ts` | request shapes, parsing (the tab → status, the type filter, the rules-on filter), the response (the person's summary, owner changes, `can_clinozy_handle`, `next_task_id`) |
| `tasks.repository.ts` | the shared app record layer plus Mine, the type filter, the rules-on filter, owner checks, owner-change rows, the record's person and branch, the leave step's release, `insertRuleTask` |
| `tasks.rules.ts` | owner and record checks, rule tasks never edited, the actions `resolve` (the outcomes the task offers and their effects, what's next) and `reassign` (the lead moves too), the drawer's decoration |
| `tasks.rule-tasks.ts` | `openRuleTask` / `openCallBackTask` — the write-time rule tasks (a check-in or review needing action, an `unhappy` outcome) |
| `tasks.service.ts` / `.controller.ts` / `.routes.ts` | the routes below |
| `task-rule-conditions.repository.ts` | the 15 rules as SQL — which records open a task, while when it stays open, its due time and owner |
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
deduplicated `task-rules` job each. The job, in the organization's context and one transaction,
first takes the organization's run lock (`TaskRulesRepository.lockRun` — a transaction-scoped
advisory lock in the `TASK_RULES_RUN` space), so a retried or stalled job running beside a fresh
one waits its turn and then finds the steps taken and the notices queued. Then it:
wakes the snoozed tasks whose time came; per rule closes the open tasks whose record no longer
qualifies ("Done by Clinozy"), then — when the rule is on — opens one task for each record that
qualifies and has no open one (nor one a person resolved since the condition began); then takes
the step of the due tasks of the rules set to "Let Clinozy handle" (a queued WhatsApp message for
`confirm`, `payment_due` and `feedback` — none to a person who replied STOP, D32: their task stays
for a person; a re-target lead for `gone_quiet`) and closes them, marked
`is_handled_by_clinozy` — like a person's resolution, that keeps the rule quiet while its condition
holds, so a reminder goes out once per condition, not every run. A task closed only because its
record changed is not marked, and a fresh one opens when the record qualifies again. At most 200
tasks per rule per run.

It then opens a re-target lead (launch D35, D79 WC-17 — `kind` `retarget`, no owner) for each
patient whose last visit — checked in or completed — is the clinic's `retarget_after_days` (default
90) or more ago, with marketing consent, nothing booked, no open lead and no re-target lead since that
visit; staff send the first message.

Then, when the clinic's WhatsApp is connected and delivery is on, it queues Clinozy's notices
(launch D78, `workers/task-rules-messages.processor.ts`): the day-before reminder of tomorrow's
bookings once the clinic's `reminder_hour` has passed (WC-6, `reminder_queued`), the confirm
request of each scheduled booking not asked yet — more than 2 hours and at most 60 days ahead, no
walk-in (WC-5, `confirm_requested`) — and the receipt of each `receipt` payment of the last 24 hours
(WC-9). Reminders go first, so a booking due both gets the reminder alone. A notice moves only the
contact's `last_activity_at` (a question the person asked still waits for a person — the `reply`
rule). `confirm`'s own step sends nothing when the booking was asked already. A booking, a move,
a status change and a delete ask for the run right after their commit, and so does a message or a
call (D81 T7, WC-48) — a reply or a confirm closes its task at once rather than at the next sweep;
the job asks for delivery when it queued anything. One job waits per organization, and one more
while it runs, so a write committed during a run is picked up by the next.

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC on both tables; the retention
  arm (USING only) lets the deleted-record purge erase `app.tasks` rows.
- **One open task per rule per record (TK4):** the unique partial index on
  `(organization_id, rule_key, source_key)`; every rule task goes through it.
- **Each step once (TK10, D78):** one run per organization at a time (the run lock); a task whose
  step Clinozy took (`is_handled_by_clinozy`) or a person resolved keeps the rule from opening
  another for the same condition (`anchor_at`).
- **An owner or a role queue (TK6):** one of the two; an owner is an active member who can see tasks,
  and a queue's role must hold `task:read` here — a queue nobody can see is a 400 `owner_role` (launch
  D83 (5); the rules' own queues are chosen by the rule).
- **Rule tasks are the server's (TK7, TK9):** never changed or deleted by hand (`409 rule_task`).
- **Who had it (TK8):** every reassign and every leave writes an owner-change row.
- **Each task its own outcomes (D81 TASKS-M2):** a resolve takes only an outcome its rule offers
  (`TASK_RULE_OUTCOMES`) — a task made by hand `done` or `no_answer` — else a 400 `outcome`.
- **A lead moves only with `lead:update` (D81 TASKS-M3):** the claim of a `claim` task and the
  reassign of a lead's task move the lead's owner, so they need `lead:update` too (a 403
  `missing_permission`).
- **One type filter (D81 T6):** `rule_key` and `kind` (each a comma list) together are a task of
  any rule or kind named — `rule_key IN (…) OR kind IN (…)`.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409.
- **The server's words are English (D81 TASKS-M4, M6):** a rule task's `title` and `why`, a
  `no_answer` snooze's `snooze_label` and an automatic close's `result_text` — a translated
  client renders from `rule_key`, `outcome` and the linked record. The CSV export writes
  `contact` as JSON in one cell and `owner_changes` as its entries' JSON joined with `|`.
