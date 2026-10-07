import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  TASK_KIND_VALUES,
  TASK_RULE_KEY_VALUES,
  TASK_OWNER_ROLE_VALUES,
  TASK_STATUS_VALUES,
  TASK_OUTCOME_VALUES,
  TASK_PRIORITY_VALUES,
} from './tasks.constants.js';

/** Path params of the by-id `tasks` routes. */
export const tasksIdParamsDto = z
  .object({
    task_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new task. */
export const CreateTaskDto = z
  .object({
    kind: z.enum(TASK_KIND_VALUES).optional(),
    title: trimmedStringMinMax(1, 120),
    why: trimmedStringMinMax(1, 280).nullable().optional(),
    owner_membership_id: recordIdSchema.nullable().optional(),
    owner_role: z.enum(TASK_OWNER_ROLE_VALUES).optional(),
    patient_id: recordIdSchema.nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    due_at: instantSchema,
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
    should_remind_before: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/tasks/{task_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateTaskDto = z
  .object({
    kind: z.enum(TASK_KIND_VALUES).optional(),
    title: trimmedStringMinMax(1, 120).optional(),
    why: trimmedStringMinMax(1, 280).nullable().optional(),
    owner_membership_id: recordIdSchema.nullable().optional(),
    owner_role: z.enum(TASK_OWNER_ROLE_VALUES).optional(),
    patient_id: recordIdSchema.nullable().optional(),
    lead_id: recordIdSchema.nullable().optional(),
    due_at: instantSchema.optional(),
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
    should_remind_before: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `tasks` list — keyset paging, `q` search, sort and filters. */
export const listTasksQueryDto = listSearchSortSchema(['created_at', 'due_at'] as const)
  .extend({
    kind: z.enum(TASK_KIND_VALUES).optional(),
    rule_key: z.enum(TASK_RULE_KEY_VALUES).optional(),
    owner_membership_id: recordIdSchema.optional(),
    owner_role: z.enum(TASK_OWNER_ROLE_VALUES).optional(),
    patient_id: recordIdSchema.optional(),
    lead_id: recordIdSchema.optional(),
    due_at_from: z.iso.datetime({ offset: true }).optional(),
    due_at_to: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(TASK_STATUS_VALUES).optional(),
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Body of `POST /app/tasks/{task_id}/snooze`. */
export const snoozeTaskDto = z
  .object({
    snoozed_until: instantSchema,
    snooze_label: trimmedStringMinMax(1, 40).optional(),
  })
  .strict();

/** Body of `POST /app/tasks/{task_id}/resolve`. */
export const resolveTaskDto = z
  .object({
    outcome: z.enum(TASK_OUTCOME_VALUES).optional(),
    result_text: trimmedStringMinMax(1, 280).optional(),
    note: trimmedStringMinMax(1, 280).optional(),
  })
  .strict();

/** Parsed {@link CreateTaskDto}. */
export type CreateTaskInput = z.infer<typeof CreateTaskDto>;
/** Parsed {@link UpdateTaskDto}. */
export type UpdateTaskInput = z.infer<typeof UpdateTaskDto>;
