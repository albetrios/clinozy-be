import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { TasksRepository } from './tasks.repository.js';
import { serializeTask } from './tasks.serializer.js';
import type { TaskOutput } from './tasks.types.js';
import {
  validateCreateTask,
  validateListTasksQuery,
  validateResolveTask,
  validateSnoozeTask,
  validateUpdateTask,
} from './tasks.validator.js';

/**
 * Tasks of the active organization (launch ROUTE #58): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `snooze`, `resolve`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Task')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class TasksService extends BaseRecordService<TaskOutput> {
  constructor(organizationService: OrganizationService, repository: TasksRepository) {
    super(organizationService, {
      label: 'Task',
      repository,
      parseCreate: validateCreateTask,
      parseUpdate: validateUpdateTask,
      parseList: validateListTasksQuery,
      serialize: serializeTask,
      references: [
        { field: 'owner_membership_id', table: memberships, label: 'team member' },
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'lead_id', table: leads, label: 'lead' },
      ],
      transitions: {
        snooze: {
          from: ['open', 'snoozed'],
          set: { status: 'snoozed' },
          parse: validateSnoozeTask,
        },
        resolve: {
          from: ['open', 'snoozed'],
          set: { status: 'done' },
          stamp: ['resolved_at'],
          parse: validateResolveTask,
        },
      },
    });
  }
}
