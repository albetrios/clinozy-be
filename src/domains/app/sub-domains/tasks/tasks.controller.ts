import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { TasksService } from './tasks.service.js';
import type { TaskOutput } from './tasks.types.js';

/**
 * HTTP handlers for the `tasks` routes — {@link BaseRecordController} on {@link TasksService}; the
 * export answers the list as CSV (TK2).
 */
export class TasksController extends BaseRecordController<TaskOutput> {
  constructor(service: TasksService) {
    super(service, {
      resource: 'task',
      idParam: 'task_id',
      readPermission: APP_PERMISSIONS.TASK_READ,
      exportName: 'tasks',
    });
  }
}

/** The `tasks` controller the routes register. */
export function createTasksController(service: TasksService): TasksController {
  return new TasksController(service);
}
