import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type {
  BaseRecordListResult,
  BaseRecordVisibility,
} from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { TASK_OPEN_STATUS_VALUES, TASK_STATUS } from './tasks.constants.js';
import type { TasksRepository } from './tasks.repository.js';
import { createTasksRules } from './tasks.rules.js';
import { serializeTask } from './tasks.serializer.js';
import type { TaskOutput } from './tasks.types.js';
import {
  validateCreateTask,
  validateListTasksQuery,
  validateSnoozeTask,
  validateUpdateTask,
} from './tasks.validator.js';

/** The list options the kernel takes (the scope's queues are added here). */
type TaskListOptions = {
  parentPublicId?: string | undefined;
  actingUserPublicId?: string | undefined;
  visibility?: BaseRecordVisibility | undefined;
  withTotal?: boolean | undefined;
  referenceIn?: Readonly<Record<string, readonly string[]>> | undefined;
  derived?: Readonly<Record<string, unknown>> | undefined;
};

/**
 * The team's to-do list (launch ROUTE #138, routes-final 10.A): the Tasks tabs and their CSV, a
 * task by hand, read, change one made by hand, snooze, resolve with an outcome and a next step,
 * reassign, delete and restore one made by hand.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.tasks` — branch-filtered on the
 *   record's branch (`branch_id`, no branch = every branch, TK3); the owner, the person, the record
 *   and the resolver are references; the rules hold the owner, the record, the outcomes and the
 *   reassign (TK5–TK9). `scope=mine` (default) keeps the caller's tasks and their roles' queues
 *   (TK3). Reading needs `task:read`, adding `task:create`, changing, snoozing, resolving and
 *   reassigning `task:update`, deleting and restoring `task:delete`, the CSV `task:export` (the
 *   routes' gates, TK2).
 * - **Failure modes:** `NotFoundError('Task')`; `ValidationError` for a bad body or query, a
 *   reference that is no live record here, or per the rules; `ConflictError` per the rules, a stale
 *   save, a done task's action or a restore of a live task.
 */
export class TasksService extends BaseRecordService<TaskOutput> {
  constructor(
    organizationService: OrganizationService,
    private readonly tasksRepository: TasksRepository,
  ) {
    super(organizationService, {
      label: 'Task',
      repository: tasksRepository,
      parseCreate: validateCreateTask,
      parseUpdate: validateUpdateTask,
      parseList: validateListTasksQuery,
      serialize: serializeTask,
      references: [
        { field: 'owner_membership_id', table: memberships, label: 'team member' },
        { field: 'resolved_by_membership_id', table: memberships, label: 'team member' },
        { field: 'contact_id', table: contacts, label: 'contact' },
        { field: 'lead_id', table: leads, label: 'lead' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_treatment_id', table: patient_treatments, label: 'treatment' },
        { field: 'patient_check_in_id', table: patient_check_ins, label: 'check-in' },
        { field: 'patient_review_id', table: patient_reviews, label: 'review' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
        { field: 'pending_credit_id', table: pending_credits, label: 'pending credit' },
        { field: 'branch_id', table: branches, label: 'branch' },
      ],
      branchColumn: 'branch_id',
      transitions: {
        snooze: {
          from: [...TASK_OPEN_STATUS_VALUES],
          set: { status: TASK_STATUS.SNOOZED },
          parse: validateSnoozeTask,
        },
      },
      ...createTasksRules(tasksRepository),
    });
  }

  /** TK3: the Tasks tabs — `scope=mine` (default) adds the caller's tasks and their roles' queues. */
  override async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    options: TaskListOptions = {},
  ): Promise<BaseRecordListResult<TaskOutput>> {
    if ((query as { scope?: string } | null)?.scope === 'everyone') {
      return super.list(scope, query, options);
    }
    const worker = await withAppDatabaseContext(scope, async () =>
      this.tasksRepository.findWorker({
        organizationId: await this.organizationId(scope),
        userId: await this.userId(options.actingUserPublicId),
      }),
    );
    return super.list(scope, query, { ...options, derived: { ...options.derived, mine: worker } });
  }
}
