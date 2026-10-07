import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateTaskDto,
  type CreateTaskInput,
  listTasksQueryDto,
  UpdateTaskDto,
  type UpdateTaskInput,
  snoozeTaskDto,
  resolveTaskDto,
} from './tasks.dto.js';

/** Parses a task create body; throws `ValidationError` naming each bad field. */
export function validateCreateTask(data: unknown): CreateTaskInput {
  return withInstants(parseWithSchema(CreateTaskDto, data), ['due_at']);
}

/** Parses a task update body; throws `ValidationError` naming each bad field. */
export function validateUpdateTask(data: unknown): UpdateTaskInput {
  return withInstants(parseWithSchema(UpdateTaskDto, data), ['due_at']);
}

/** Parses the `GET /app/tasks` query into a list input (filters by column). */
export function validateListTasksQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listTasksQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      kind: query.kind,
      rule_key: query.rule_key,
      owner_role: query.owner_role,
      status: query.status,
      priority: query.priority,
    },
    referenceEquals: {
      owner_membership_id: query.owner_membership_id,
      patient_id: query.patient_id,
      lead_id: query.lead_id,
    },
    ranges: {
      due_at: {
        from: query.due_at_from === undefined ? undefined : new Date(query.due_at_from),
        to: query.due_at_to === undefined ? undefined : new Date(query.due_at_to),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `snooze` action. */
export function validateSnoozeTask(data: unknown): Record<string, unknown> {
  return withInstants(parseWithSchema(snoozeTaskDto, data ?? {}), ['snoozed_until']);
}

/** Parses the body of the `resolve` action. */
export function validateResolveTask(data: unknown): Record<string, unknown> {
  return parseWithSchema(resolveTaskDto, data ?? {});
}
