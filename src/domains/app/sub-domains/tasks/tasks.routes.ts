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
  UpdateTaskDto,
  listTasksQueryDto,
  resolveTaskDto,
  snoozeTaskDto,
  tasksIdParamsDto,
} from './tasks.dto.js';

/** Registers the `tasks` routes (prefix `/api/v1/app`). */
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
            "Returns one page of the active organization's tasks (newest first by default), with the total count; `q` searches, filters narrow. Requires task:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export tasks',
          description:
            'Returns the tasks the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and task:read.',
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
          summary: 'Create task',
          description: 'Adds a task to the active organization. Requires task:create.',
          tags: ['Task'],
          body: CreateTaskDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { task_id: string } }>(
      '/tasks/:task_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get task',
          description: 'Returns one task of the active organization. Requires task:read.',
          tags: ['Task'],
          params: tasksIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { task_id: string } }>(
      '/tasks/:task_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update task',
          description:
            "Changes any of a task's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires task:update.",
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: UpdateTaskDto,
        },
      },
      controller.update,
    );
    zodApplication.post<{ Params: { task_id: string } }>(
      '/tasks/:task_id/snooze',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Snooze task',
          description:
            'Snoozes the task until the chosen time. A task whose status does not allow it is a 409. Requires task:update.',
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: snoozeTaskDto,
        },
      },
      controller.transition('snooze'),
    );
    zodApplication.post<{ Params: { task_id: string } }>(
      '/tasks/:task_id/resolve',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Resolve task',
          description:
            'Marks the task done with its outcome. A task whose status does not allow it is a 409. Requires task:update.',
          tags: ['Task'],
          params: tasksIdParamsDto,
          body: resolveTaskDto,
        },
      },
      controller.transition('resolve'),
    );
    zodApplication.delete<{ Params: { task_id: string } }>(
      '/tasks/:task_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete task',
          description:
            "Soft-deletes a task with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires task:delete.",
          tags: ['Task'],
          params: tasksIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { task_id: string } }>(
      '/tasks/:task_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.TASK_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore task',
          description: "Undoes a task's delete. A live task is a 409. Requires task:delete.",
          tags: ['Task'],
          params: tasksIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
