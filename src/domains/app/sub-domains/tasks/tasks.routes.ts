import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { TasksService } from './tasks.service.js';
import { createTasksController } from './tasks.controller.js';
import {
  CreateTaskDto,
  ReassignTaskDto,
  ResolveTaskDto,
  SnoozeTaskDto,
  UpdateTaskDto,
  listTasksQueryDto,
  tasksIdParamsDto,
} from './tasks.dto.js';

/** The by-id routes' path params. */
type TaskParams = { Params: { task_id: string } };

/** Registers the `tasks` routes (prefix `/api/v1/app`) — routes-final 10.A, routes 1–10. */
export function tasksRoutes(service: TasksService): FastifyPluginAsync {
  const controller = createTasksController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/tasks',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List tasks',
          description:
            "Returns one page of the Tasks tabs: `tab` = `open` (default — soonest due first, so overdue on top) · `snoozed` · `done` (resolved today unless `resolved_from` / `resolved_to` is sent); `scope` = `mine` (default — yours, and the unowned ones in your roles' queues) · `everyone`. The type filter: `rule_key` (several, comma-separated) and `kind` (several — `rule`, `follow_up`, `manual`; `follow_up,manual` are the follow-ups people set) — a task of any rule or kind named, so `rule_key=confirm&kind=follow_up,manual` lists the confirms and the follow-ups together. Filters `owner_membership_id`, `owner_role`, `contact_id`, `lead_id`, `appointment_id`, `branch_id` (several, comma-separated — the one branch filter here, where Leads and Appointments name theirs `branch_ids`; a task carries its record's branch; another branch's only with branch:read), the due, resolved and created ranges, `q` (title, why, the person's name); sort `due_at` (default), `resolved_at` or `created_at`. A rule that is off hides its tasks. Each task carries its person (`contact` — name, phone, `preference_tags`), its record, its latest `owner_changes` and `can_clinozy_handle`. A rule task's `title` and `why`, a `no_answer` snooze's `snooze_label` and an automatic close's `result_text` are the server's English text — render a translated row from `rule_key`, `outcome` and the linked record. Requires task:read.",
          tags: ['Task'],
          querystring: listTasksQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/tasks/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export tasks',
          description:
            "Returns the tasks the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `tasks-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content`). One column per field of a listed task, in its order: `contact` is its JSON text in one cell, `owner_changes` its entries' JSON joined with `|`, a null an empty cell. Requires task:export and task:read.",
          tags: ['Task'],
          querystring: listTasksQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/tasks',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a task',
          description:
            "Adds a task by hand (`kind` `manual`): `title*` (1–120), `due_at*`, and `owner_membership_id` (an active member who can see tasks) or `owner_role` (a role queue) — neither, both or a member who cannot work tasks is a 400; optional `why` (≤ 280), `contact_id`, one record — `lead_id`, `appointment_id`, `patient_treatment_id`, `patient_check_in_id`, `patient_review_id`, `invoice_id`, `pending_credit_id` or `medical_rep_id` (more than one, or another contact's, a 400; the task takes the record's person and branch) — and `priority` (`low` · `normal` · `high`). Requires task:create.",
          tags: ['Task'],
          body: CreateTaskDto,
        },
      },
      controller.create,
    );
    zodApplication.get<TaskParams>(
      '/tasks/:task_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a task',
          description:
            'Returns one task — the drawer — with its person, record, outcome and latest owner changes. A task about a branch you cannot see is a 404. Requires task:read.',
          tags: ['Task'],
          params: tasksIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<TaskParams>(
      '/tasks/:task_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a task',
          description:
            "Changes a task made by hand (`manual` or `follow_up`): `title`, `why` (null clears it), `due_at`, `priority`. A rule's task is never edited — a 409 `rule_task`. Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires task:update.",
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: UpdateTaskDto,
        },
      },
      controller.update,
    );
    zodApplication.post<TaskParams>(
      '/tasks/:task_id/snooze',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Snooze a task',
          description:
            'Snoozes an open or snoozed task: `snoozed_until*` (in the future — a 400 otherwise), optional `snooze_label` ("Tomorrow 10:00"). It opens again when the time comes. A done task is a 409 `transition_not_allowed`. Requires task:update.',
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: SnoozeTaskDto,
        },
      },
      controller.transition('snooze'),
    );
    zodApplication.post<TaskParams>(
      '/tasks/:task_id/resolve',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resolve a task',
          description:
            "Takes an outcome the task offers: `outcome*` — `done` (on a claim task, the lead is yours — that needs lead:update, a 403 `missing_permission` otherwise), `no_answer` (snoozes it 3 hours), `doing_well` (logs a Better check-in for the patient), `log_check_in`, `happy`, `unhappy` (opens a call-back for the visit's doctor). Each task offers its own: `follow_up` and `confirm` rules `done` · `no_answer`; `feedback` `happy` · `unhappy` · `log_check_in`; `aftercare` `log_check_in` · `doing_well` · `no_answer`; every other rule `done`; a task made by hand (`follow_up`, `manual`) `done` · `no_answer` — another is a 400 `outcome`, as are `doing_well` and `log_check_in` without the person's patient file. Optional `result_text` (≤ 200 — the outcome's label), `note` (≤ 280), `next` — What's next: `title*`, `due_at*`, an owner or a role queue, `note` — a follow-up for the same person and record, its id in `next_task_id`. A done task is a 409 `transition_not_allowed`. Requires task:update.",
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: ResolveTaskDto,
        },
      },
      controller.transition('resolve'),
    );
    zodApplication.post<TaskParams>(
      '/tasks/:task_id/reassign',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Reassign a task',
          description:
            "Gives a task to `owner_membership_id` (an active member who can see tasks) or `owner_role` (a role queue) — exactly one, a 400 otherwise; an owner-change row records from, to and by whom (`owner_changes`). A lead's task moves the lead too — a member owns it with a fresh hold, a queue returns it to the pool — so it needs lead:update as well (a 403 `missing_permission`). A done task is a 409 `transition_not_allowed`. Requires task:update.",
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: ReassignTaskDto,
        },
      },
      controller.transition('reassign'),
    );
    zodApplication.delete<TaskParams>(
      '/tasks/:task_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a task',
          description:
            "Deletes a task made by hand with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. A rule's task goes when its record changes or its rule is turned off — a 409 `rule_task`. Requires task:delete.",
          tags: ['Task'],
          params: tasksIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<TaskParams>(
      '/tasks/:task_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a task',
          description:
            "Undoes a task's delete. A live one is a 409 `record_not_deleted`. Requires task:delete.",
          tags: ['Task'],
          params: tasksIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
