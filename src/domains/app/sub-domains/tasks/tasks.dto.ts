import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdListSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  TASK_KIND_VALUES,
  TASK_OUTCOME_VALUES,
  TASK_OWNER_ROLE_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_RULE_VALUES,
  TASK_SCOPE_VALUES,
  TASK_TAB_VALUES,
} from './tasks.constants.js';

/** Who a task goes to — a member or a role queue (TK6); the rules want exactly one. */
const taskOwnerFields = {
  owner_membership_id: recordIdSchema.optional(),
  owner_role: z.enum(TASK_OWNER_ROLE_VALUES).optional(),
};

/** The fields a task made by hand and its change share (10.A.8 #3, #5). */
const taskFields = {
  title: trimmedStringMinMax(1, 120),
  why: trimmedStringMinMax(1, 280).nullable(),
  due_at: instantSchema,
  priority: z.enum(TASK_PRIORITY_VALUES),
};

/** The records a task may be about — at most one (TK5). */
const taskRecordFields = {
  lead_id: recordIdSchema.optional(),
  appointment_id: recordIdSchema.optional(),
  patient_treatment_id: recordIdSchema.optional(),
  patient_check_in_id: recordIdSchema.optional(),
  patient_review_id: recordIdSchema.optional(),
  invoice_id: recordIdSchema.optional(),
  pending_credit_id: recordIdSchema.optional(),
  medical_rep_id: recordIdSchema.optional(),
};

/** Path params of the by-id task routes. */
export const tasksIdParamsDto = z
  .object({
    task_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/tasks` (10.A.8 #3): `title*`, `due_at*`; `owner_membership_id` or
 * `owner_role`; optional `why`, `contact_id`, one record link, `priority`.
 */
export const CreateTaskDto = z
  .object({
    title: taskFields.title,
    due_at: taskFields.due_at,
    ...taskOwnerFields,
    why: taskFields.why.optional(),
    contact_id: recordIdSchema.optional(),
    ...taskRecordFields,
    priority: taskFields.priority.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/tasks/{task_id}` (10.A.8 #5) — a task made by hand: `title`, `why` (null
 * clears it), `due_at`, `priority`; `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateTaskDto = z
  .object({
    title: taskFields.title.optional(),
    why: taskFields.why.optional(),
    due_at: taskFields.due_at.optional(),
    priority: taskFields.priority.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Body of `POST …/snooze` (10.A.8 #6): `snoozed_until*` (in the future), `snooze_label`. */
export const SnoozeTaskDto = z
  .object({
    snoozed_until: instantSchema,
    snooze_label: trimmedStringMinMax(1, 40).optional(),
  })
  .strict();

/** "What's next" — the follow-up a resolve sets (TK7). */
const nextTaskDto = z
  .object({
    title: taskFields.title,
    due_at: taskFields.due_at,
    ...taskOwnerFields,
    note: trimmedStringMinMax(1, 280).optional(),
  })
  .strict();

/**
 * Body of `POST …/resolve` (10.A.8 #7): `outcome*`; optional `result_text` (the outcome's label),
 * `note`, `next` (`title*`, `due_at*`, an owner or a role queue, `note`).
 */
export const ResolveTaskDto = z
  .object({
    outcome: z.enum(TASK_OUTCOME_VALUES),
    result_text: trimmedStringMinMax(1, 200).optional(),
    note: trimmedStringMinMax(1, 280).optional(),
    next: nextTaskDto.optional(),
  })
  .strict();

/** Body of `POST …/reassign` (10.A.8 #8): `owner_membership_id` or `owner_role`. */
export const ReassignTaskDto = z.object(taskOwnerFields).strict();

/**
 * Query of the Tasks tabs and their export (10.A.8 #1): `tab` (`open` default · `snoozed` · `done`
 * — resolved today unless a range is sent), `scope` (`mine` default · `everyone`), the type filter
 * — `kind` (several) and `rule_key` (several), a task of any rule or kind named (D81 T6) — the
 * owner, the queue, the person, the lead, the visit, the branch (several), the due, resolved and
 * created ranges, `q`; sort `due_at` (default, soonest first) | `resolved_at` | `created_at`.
 */
export const listTasksQueryDto = listSearchSortSchema([
  'due_at',
  'resolved_at',
  'created_at',
] as const)
  .extend({
    tab: z.enum(TASK_TAB_VALUES).optional(),
    scope: z.enum(TASK_SCOPE_VALUES).optional(),
    kind: valueListSchema(TASK_KIND_VALUES).optional(),
    rule_key: valueListSchema(TASK_RULE_VALUES).optional(),
    owner_membership_id: recordIdSchema.optional(),
    owner_role: z.enum(TASK_OWNER_ROLE_VALUES).optional(),
    contact_id: recordIdSchema.optional(),
    lead_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    branch_id: recordIdListSchema.optional(),
    due_from: instantSchema.optional(),
    due_to: instantSchema.optional(),
    resolved_from: instantSchema.optional(),
    resolved_to: instantSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateTaskDto}. */
export type CreateTaskInput = z.infer<typeof CreateTaskDto>;
/** Parsed {@link UpdateTaskDto}. */
export type UpdateTaskInput = z.infer<typeof UpdateTaskDto>;
/** Parsed {@link ResolveTaskDto}. */
export type ResolveTaskInput = z.infer<typeof ResolveTaskDto>;
/** Parsed {@link ReassignTaskDto}. */
export type ReassignTaskInput = z.infer<typeof ReassignTaskDto>;
